import type { Job } from "pg-boss";
import { eq, and, inArray } from "drizzle-orm";
import type { NotificationBatchPayload, WorkerDeps } from "@/queues/types.js";
import { QUEUE } from "@/queues/types.js";
import {
  members,
  users,
  notifications,
  notificationPreferences,
  sentReminders,
} from "@/db/schema/index.js";
import { buildPushPayload } from "@/services/push-payload.builder.js";

/**
 * Maps a notification type to its corresponding preference field
 */
export function getPreferenceField(
  type: string,
): "dailyItinerary" | "tripMessages" | null {
  switch (type) {
    case "daily_itinerary":
      return "dailyItinerary";
    case "trip_message":
      return "tripMessages";
    default:
      return null;
  }
}

/**
 * Determines whether an SMS should be sent based on notification type and user preferences
 * For batch worker usage where preferences are already fetched
 */
export function shouldSendSms(
  type: string,
  prefs: {
    dailyItinerary: boolean;
    tripMessages: boolean;
  },
): boolean {
  // trip_update notifications always send
  if (type === "trip_update") {
    return true;
  }

  const prefField = getPreferenceField(type);

  // Unknown type defaults to sending
  if (prefField === null) {
    return true;
  }

  return prefs[prefField];
}

/**
 * Handles notification/batch jobs.
 * Resolves going members for a trip, checks preferences and dedup,
 * bulk-inserts notifications and sentReminders, and enqueues SMS delivery jobs.
 */
export async function handleNotificationBatch(
  job: Job<NotificationBatchPayload>,
  deps: WorkerDeps,
): Promise<void> {
  const { tripId, type, title, body, data, excludeUserId } = job.data;

  // 1. Query going members with phone numbers
  const goingMembers = await deps.db
    .select({ userId: members.userId, phoneNumber: users.phoneNumber })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(and(eq(members.tripId, tripId), eq(members.status, "going")));

  // 2. Filter out excludeUserId
  const targetMembers = excludeUserId
    ? goingMembers.filter((m) => m.userId !== excludeUserId)
    : goingMembers;

  if (targetMembers.length === 0) {
    return;
  }

  const userIds = targetMembers.map((m) => m.userId);

  // 3. Batch query preferences
  const prefsRows = await deps.db
    .select({
      userId: notificationPreferences.userId,
      dailyItinerary: notificationPreferences.dailyItinerary,
      tripMessages: notificationPreferences.tripMessages,
    })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.tripId, tripId),
        inArray(notificationPreferences.userId, userIds),
      ),
    );

  const prefsMap = new Map(
    prefsRows.map((p) => [
      p.userId,
      {
        dailyItinerary: p.dailyItinerary,
        tripMessages: p.tripMessages,
      },
    ]),
  );

  const defaultPrefs = {
    dailyItinerary: true,
    tripMessages: true,
  };

  // 4. Dedup for cron types (daily_itinerary)
  const isCronType = type === "daily_itinerary";
  const referenceId = data?.referenceId ? String(data.referenceId) : null;
  const dedupSet = new Set<string>();

  if (isCronType && referenceId) {
    const existing = await deps.db
      .select({ userId: sentReminders.userId })
      .from(sentReminders)
      .where(
        and(
          eq(sentReminders.type, type),
          eq(sentReminders.referenceId, referenceId),
          inArray(sentReminders.userId, userIds),
        ),
      );

    for (const row of existing) {
      dedupSet.add(row.userId);
    }
  }

  // 5. Build notification records and SMS jobs
  const notificationRecords: {
    userId: string;
    tripId: string;
    type: string;
    title: string;
    body: string;
    data: Record<string, unknown> | null;
  }[] = [];

  const smsJobs: { data: { phoneNumber: string; message: string } }[] = [];
  const pushJobs: {
    data: {
      userId: string;
      title: string;
      body: string;
      url: string;
      tag: string;
    };
  }[] = [];
  const reminderUserIds: string[] = [];

  for (const member of targetMembers) {
    // Skip if already sent (dedup)
    if (dedupSet.has(member.userId)) {
      continue;
    }

    // Build notification record
    notificationRecords.push({
      userId: member.userId,
      tripId,
      type,
      title,
      body,
      data: data ?? null,
    });

    // Track user for sentReminders insert
    if (isCronType && referenceId) {
      reminderUserIds.push(member.userId);
    }

    // Check preferences for this notification type
    const userPrefs = prefsMap.get(member.userId) ?? defaultPrefs;
    const shouldSend = shouldSendSms(type, userPrefs);

    if (shouldSend) {
      smsJobs.push({
        data: {
          phoneNumber: member.phoneNumber,
          message: `${title}: ${body}`,
        },
      });

      // Build push payload using the same preference gate
      const pushPayload = buildPushPayload(type, title, body, data);
      pushJobs.push({
        data: {
          userId: member.userId,
          ...pushPayload,
        },
      });
    }
  }

  // 6. Bulk insert notifications
  if (notificationRecords.length > 0) {
    await deps.db.insert(notifications).values(notificationRecords);
  }

  // 7. Bulk insert sentReminders (cron types only)
  if (isCronType && referenceId && reminderUserIds.length > 0) {
    await deps.db
      .insert(sentReminders)
      .values(
        reminderUserIds.map((userId) => ({
          type,
          referenceId,
          userId,
        })),
      )
      .onConflictDoNothing();
  }

  // 8. Enqueue SMS delivery jobs
  if (smsJobs.length > 0) {
    await deps.boss.insert(QUEUE.NOTIFICATION_DELIVER, smsJobs);
  }

  // 9. Enqueue push delivery jobs
  if (pushJobs.length > 0) {
    await deps.boss.insert(QUEUE.PUSH_DELIVER, pushJobs);
  }
}
