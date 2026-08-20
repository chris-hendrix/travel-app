import { eq, and, count, isNull, desc, sql, lt, or } from "drizzle-orm";
import {
  notifications,
  notificationPreferences,
  members,
  users,
} from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";
import { NotificationNotFoundError } from "@/errors.js";
import { z } from "zod";
import { encodeCursor, decodeCursorAs } from "@/utils/pagination.js";

const timestampCursorSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
});
import type { PgBoss } from "pg-boss";
import { QUEUE } from "@/queues/types.js";
import type { NotificationBatchPayload } from "@/queues/types.js";

/**
 * Internal result type for notification queries
 */
interface NotificationResult {
  id: string;
  userId: string;
  tripId: string | null;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * Notification Service Interface
 * Defines the contract for notification management operations
 */
export interface INotificationService {
  // Queries
  getNotifications(
    userId: string,
    opts: {
      cursor?: string;
      limit: number;
      unreadOnly?: boolean;
      tripId?: string;
    },
  ): Promise<{
    data: NotificationResult[];
    meta: {
      total: number;
      limit: number;
      hasMore: boolean;
      nextCursor: string | null;
    };
    unreadCount: number;
  }>;
  getUnreadCount(userId: string): Promise<number>;
  getTripUnreadCount(userId: string, tripId: string): Promise<number>;

  // Mutations
  markAsRead(notificationId: string, userId: string): Promise<void>;
  markAllAsRead(userId: string, tripId?: string): Promise<void>;

  // Creation & Delivery
  createNotification(params: {
    userId: string;
    tripId?: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }): Promise<NotificationResult>;
  notifyTripMembers(params: {
    tripId: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    excludeUserId?: string;
  }): Promise<void>;

  // Preferences
  getPreferences(
    userId: string,
    tripId: string,
  ): Promise<{
    dailyItinerary: boolean;
    tripMessages: boolean;
  }>;
  updatePreferences(
    userId: string,
    tripId: string,
    prefs: {
      dailyItinerary: boolean;
      tripMessages: boolean;
    },
  ): Promise<{
    dailyItinerary: boolean;
    tripMessages: boolean;
  }>;
  createDefaultPreferences(userId: string, tripId: string): Promise<void>;
}

/**
 * Notification Service Implementation
 * Handles notification creation, delivery, preferences, and queries
 */
export class NotificationService implements INotificationService {
  constructor(
    private db: AppDatabase,
    private boss: PgBoss | null = null,
  ) {}

  /**
   * Gets cursor-paginated notifications for a user with optional filters
   */
  async getNotifications(
    userId: string,
    opts: {
      cursor?: string;
      limit: number;
      unreadOnly?: boolean;
      tripId?: string;
    },
  ): Promise<{
    data: NotificationResult[];
    meta: {
      total: number;
      limit: number;
      hasMore: boolean;
      nextCursor: string | null;
    };
    unreadCount: number;
  }> {
    const { cursor, limit, unreadOnly, tripId } = opts;

    // Build base conditions (including unreadOnly filter so count and data queries match)
    const conditions = [eq(notifications.userId, userId)];
    if (tripId) {
      conditions.push(eq(notifications.tripId, tripId));
    }
    if (unreadOnly) {
      conditions.push(isNull(notifications.readAt));
    }

    // Count total and unread in a single query using conditional aggregation
    const [counts] = await this.db
      .select({
        total: count(),
        unread:
          sql<number>`count(case when ${notifications.readAt} is null then 1 end)`.mapWith(
            Number,
          ),
      })
      .from(notifications)
      .where(and(...conditions));
    const total = counts?.total ?? 0;
    const unreadCount = counts?.unread ?? 0;

    // Build cursor WHERE clause for keyset pagination (createdAt DESC, id DESC)
    const cursorConditions = [...conditions];
    if (cursor) {
      const decoded = decodeCursorAs(cursor, timestampCursorSchema);
      const cursorCreatedAt = new Date(decoded.createdAt);
      const cursorId = decoded.id;
      cursorConditions.push(
        or(
          lt(notifications.createdAt, cursorCreatedAt),
          and(
            eq(notifications.createdAt, cursorCreatedAt),
            lt(notifications.id, cursorId),
          ),
        )!,
      );
    }

    // Fetch limit+1 to detect if there's a next page
    const rows = await this.db
      .select({
        id: notifications.id,
        userId: notifications.userId,
        tripId: notifications.tripId,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        data: notifications.data,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(and(...cursorConditions))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    // Build next cursor from the last row if there are more results
    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1]!;
      nextCursor = encodeCursor({
        createdAt: lastRow.createdAt.toISOString(),
        id: lastRow.id,
      });
    }

    return {
      data: pageRows,
      meta: { total, limit, hasMore, nextCursor },
      unreadCount,
    };
  }

  /**
   * Gets the count of unread notifications for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), isNull(notifications.readAt)),
      );
    return result?.value ?? 0;
  }

  /**
   * Gets the count of unread notifications for a user in a specific trip
   */
  async getTripUnreadCount(userId: string, tripId: string): Promise<number> {
    const [result] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.tripId, tripId),
          isNull(notifications.readAt),
        ),
      );
    return result?.value ?? 0;
  }

  /**
   * Marks a single notification as read
   * Throws NotificationNotFoundError if notification doesn't exist or belongs to different user
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const result = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId),
        ),
      )
      .returning({ id: notifications.id });

    if (result.length === 0) {
      throw new NotificationNotFoundError();
    }
  }

  /**
   * Marks all unread notifications as read for a user
   * Optionally scoped to a specific trip
   */
  async markAllAsRead(userId: string, tripId?: string): Promise<void> {
    const conditions = [
      eq(notifications.userId, userId),
      isNull(notifications.readAt),
    ];

    if (tripId) {
      conditions.push(eq(notifications.tripId, tripId));
    }

    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(...conditions));
  }

  /**
   * Creates a notification record in the database (pure DB insert).
   * SMS delivery is handled separately by queue workers.
   */
  async createNotification(params: {
    userId: string;
    tripId?: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }): Promise<NotificationResult> {
    const { userId, tripId, type, title, body, data } = params;

    // Insert notification
    const [notification] = await this.db
      .insert(notifications)
      .values({
        userId,
        tripId: tripId ?? null,
        type,
        title,
        body,
        data: data ?? null,
      })
      .returning();

    if (!notification) {
      throw new Error("Failed to create notification");
    }

    return {
      id: notification.id,
      userId: notification.userId,
      tripId: notification.tripId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    };
  }

  /**
   * Creates notifications for all going members of a trip
   * Optionally excludes a specific user (e.g., the action initiator)
   */
  async notifyTripMembers(params: {
    tripId: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    excludeUserId?: string;
  }): Promise<void> {
    const { tripId, type, title, body, data, excludeUserId } = params;

    // When pg-boss is available, delegate to the notification batch queue
    if (this.boss) {
      await this.boss.send(QUEUE.NOTIFICATION_BATCH, {
        tripId,
        type,
        title,
        body,
        data,
        excludeUserId,
      } as NotificationBatchPayload);
      return;
    }

    // Fallback: inline member loop when no queue is available
    const goingMembers = await this.db
      .select({
        userId: members.userId,
        phoneNumber: users.phoneNumber,
      })
      .from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(and(eq(members.tripId, tripId), eq(members.status, "going")));

    for (const member of goingMembers) {
      if (!member.userId) continue;
      if (excludeUserId && member.userId === excludeUserId) {
        continue;
      }

      await this.createNotification({
        userId: member.userId,
        tripId,
        type,
        title,
        body,
        ...(data != null ? { data } : {}),
      });
    }
  }

  /**
   * Gets notification preferences for a user and trip
   * Returns defaults if no preferences exist
   */
  async getPreferences(
    userId: string,
    tripId: string,
  ): Promise<{
    dailyItinerary: boolean;
    tripMessages: boolean;
  }> {
    const [row] = await this.db
      .select({
        dailyItinerary: notificationPreferences.dailyItinerary,
        tripMessages: notificationPreferences.tripMessages,
      })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.tripId, tripId),
        ),
      )
      .limit(1);

    if (!row) {
      return {
        dailyItinerary: true,
        tripMessages: true,
      };
    }

    return {
      dailyItinerary: row.dailyItinerary,
      tripMessages: row.tripMessages,
    };
  }

  /**
   * Updates notification preferences for a user and trip (upsert)
   * Returns the updated preferences
   */
  async updatePreferences(
    userId: string,
    tripId: string,
    prefs: {
      dailyItinerary: boolean;
      tripMessages: boolean;
    },
  ): Promise<{
    dailyItinerary: boolean;
    tripMessages: boolean;
  }> {
    await this.db
      .insert(notificationPreferences)
      .values({
        userId,
        tripId,
        ...prefs,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          notificationPreferences.userId,
          notificationPreferences.tripId,
        ],
        set: { ...prefs, updatedAt: new Date() },
      });

    return prefs;
  }

  /**
   * Creates default notification preferences for a user and trip
   * Idempotent: does nothing if preferences already exist
   */
  async createDefaultPreferences(
    userId: string,
    tripId: string,
  ): Promise<void> {
    await this.db
      .insert(notificationPreferences)
      .values({
        userId,
        tripId,
        dailyItinerary: true,
        tripMessages: true,
      })
      .onConflictDoNothing();
  }
}
