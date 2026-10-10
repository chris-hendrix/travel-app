import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Job } from "pg-boss";
import { db } from "@/config/database.js";
import { users, trips, members, notifications } from "@/db/schema/index.js";
import { and, eq, inArray } from "drizzle-orm";
import { handleNotificationBatch } from "@/queues/workers/notification-batch.worker.js";
import type { NotificationBatchPayload, WorkerDeps } from "@/queues/types.js";
import { QUEUE } from "@/queues/types.js";
import { SMSService } from "@/services/sms.service.js";
import { NotificationService } from "@/services/notification.service.js";
import { InvitationService } from "@/services/invitation.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { TripService } from "@/services/trip.service.js";
import { UserService, DELETED_DISPLAY_NAME } from "@/services/user.service.js";
import type { IGeocodingService } from "@/services/geocoding.service.js";
import type { IUploadService } from "@/services/upload.service.js";
import { generateUniquePhone } from "../test-utils.js";

/**
 * A soft-deleted account is not a recipient, and has no phone number to show.
 *
 * Deletion anonymizes the `users` row instead of dropping it — `members`,
 * `payments` and `user_reports` point at it — so the row keeps its `members`
 * rows, status and all, and its `phone_number` becomes a `deleted:<uuid>`
 * tombstone. Two readers used to treat that row as a live person:
 *
 *  - the fan-out (both the batch worker and the inline fallback) selected a
 *    trip's `going` members with no `deletedAt` filter, so the tombstone was
 *    pushed into an SMS job and handed to Twilio as a destination — a call
 *    that can only fail, three retries and a dead letter, on every trip-wide
 *    message or trip cancel;
 *  - the roster and the trip detail returned `users.phone_number` raw, so an
 *    organizer read `deleted:9f3c...` under the member's name.
 *
 * The fixture is built with the real `UserService.deleteAccount`, never a
 * hand-written `UPDATE`, so these tests cannot drift from what deletion
 * actually does. Every assertion is scoped to rows this file created: the
 * suite shares one database and accumulates.
 */
describe("a deleted account in a trip fan-out and roster", () => {
  const permissionsService = new PermissionsService(db);
  const notificationService = new NotificationService(db);
  const invitationService = new InvitationService(
    db,
    permissionsService,
    new SMSService(),
    notificationService,
  );
  const tripService = new TripService(
    db,
    permissionsService,
    {
      geocode: vi.fn().mockResolvedValue(null),
      getTimezone: vi.fn().mockResolvedValue(null),
      getTimezoneByCoords: vi.fn().mockResolvedValue(null),
    } as unknown as IGeocodingService,
    notificationService,
    { deleteImage: vi.fn() } as unknown as IUploadService,
  );
  const userService = new UserService(db);

  let organizerPhone: string;
  let livePhone: string;
  let deletedPhone: string;

  let organizerId: string;
  let liveId: string;
  let deletedId: string;

  let tripId: string;

  const cleanup = async () => {
    const ids = [organizerId, liveId, deletedId].filter(Boolean);
    const phones = [organizerPhone, livePhone, deletedPhone].filter(Boolean);

    if (tripId) {
      await db.delete(notifications).where(eq(notifications.tripId, tripId));
      await db.delete(members).where(eq(members.tripId, tripId));
      await db.delete(trips).where(eq(trips.id, tripId));
    }
    if (ids.length > 0) {
      // By id as well as by phone: the deleted account's phone is a tombstone
      // by then, so a phone match alone would leave its row behind.
      await db.delete(notifications).where(inArray(notifications.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    if (phones.length > 0) {
      await db.delete(users).where(inArray(users.phoneNumber, phones));
    }
  };

  beforeEach(async () => {
    organizerPhone = generateUniquePhone();
    livePhone = generateUniquePhone();
    deletedPhone = generateUniquePhone();

    await cleanup();

    const inserted = await db
      .insert(users)
      .values([
        { phoneNumber: organizerPhone, displayName: "Fan-out Organizer" },
        { phoneNumber: livePhone, displayName: "Live Member" },
        { phoneNumber: deletedPhone, displayName: "Leaves The Trip" },
      ])
      .returning();

    organizerId = inserted[0]!.id;
    liveId = inserted[1]!.id;
    deletedId = inserted[2]!.id;

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Deleted Fan-out Trip",
        destination: "Naples",
        preferredTimezone: "Europe/Rome",
        createdBy: organizerId,
      })
      .returning();
    tripId = trip!.id;

    // The deleted member is an organizer with `sharePhone` on: deletion leaves
    // the trip's member row exactly as it was, so both the fan-out and both
    // roster views see a row that looks as eligible as any other.
    await db.insert(members).values([
      { tripId, userId: organizerId, status: "going", isOrganizer: true },
      {
        tripId,
        userId: liveId,
        status: "going",
        sharePhone: true,
      },
      {
        tripId,
        userId: deletedId,
        status: "going",
        isOrganizer: true,
        sharePhone: true,
      },
    ]);

    await userService.deleteAccount(deletedId);
  });

  afterEach(async () => {
    await cleanup();
    tripId = "";
  });

  const mockDeps = (): WorkerDeps =>
    ({
      db,
      boss: {
        insert: vi.fn().mockResolvedValue(undefined),
      } as unknown as WorkerDeps["boss"],
      smsService: new SMSService(),
      pushService: {
        addSubscription: vi.fn(),
        removeSubscription: vi.fn(),
        getUserSubscriptions: vi.fn().mockResolvedValue([]),
        sendToUser: vi.fn(),
      } as unknown as WorkerDeps["pushService"],
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      } as unknown as WorkerDeps["logger"],
    }) as WorkerDeps;

  const batchJob = (
    overrides: Partial<NotificationBatchPayload> = {},
  ): Job<NotificationBatchPayload> =>
    ({
      id: "deleted-fanout-job",
      name: "notification/batch",
      data: {
        tripId,
        type: "trip_cancelled",
        title: "Trip deleted",
        body: "The organizer deleted the trip",
        ...overrides,
      },
    }) as Job<NotificationBatchPayload>;

  const notifiedIds = async () =>
    (
      await db
        .select({ userId: notifications.userId })
        .from(notifications)
        .where(eq(notifications.tripId, tripId))
    ).map((n) => n.userId);

  /** The SMS jobs the worker handed to the delivery queue. */
  const smsDestinations = (deps: WorkerDeps) => {
    const call = vi
      .mocked(deps.boss.insert)
      .mock.calls.find((c) => c[0] === QUEUE.NOTIFICATION_DELIVER);
    const jobs = (call?.[1] ?? []) as { data: { phoneNumber: string } }[];
    return jobs.map((j) => j.data.phoneNumber);
  };

  /** The user ids the worker handed to the push queue. */
  const pushUserIds = (deps: WorkerDeps) => {
    const call = vi
      .mocked(deps.boss.insert)
      .mock.calls.find((c) => c[0] === QUEUE.PUSH_DELIVER);
    const jobs = (call?.[1] ?? []) as { data: { userId: string } }[];
    return jobs.map((j) => j.data.userId);
  };

  it("builds the fixture the way deletion does: tombstone, no live phone, member row intact", async () => {
    const [row] = await db
      .select({
        phoneNumber: users.phoneNumber,
        deletedAt: users.deletedAt,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, deletedId));

    expect(row!.deletedAt).not.toBeNull();
    expect(row!.phoneNumber).toBe(`deleted:${deletedId}`);
    expect(row!.displayName).toBe(DELETED_DISPLAY_NAME);

    const [memberRow] = await db
      .select()
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.userId, deletedId)));

    expect(memberRow!.status).toBe("going");
    expect(memberRow!.isOrganizer).toBe(true);
    expect(memberRow!.sharePhone).toBe(true);
  });

  describe("notification fan-out", () => {
    it("worker path: notifies the live members and not the deleted one", async () => {
      await handleNotificationBatch(batchJob(), mockDeps());

      const notified = await notifiedIds();
      expect(notified).toContain(organizerId);
      expect(notified).toContain(liveId);
      expect(notified).not.toContain(deletedId);
      expect(notified).toHaveLength(2);
    });

    it("worker path: no SMS job carries the tombstone as its destination", async () => {
      const deps = mockDeps();
      await handleNotificationBatch(batchJob(), deps);

      const destinations = smsDestinations(deps);
      expect(destinations).toContain(organizerPhone);
      expect(destinations).toContain(livePhone);
      expect(destinations).not.toContain(`deleted:${deletedId}`);
      // Whatever the id: a destination that is not a phone number is a Twilio
      // call that can only fail, then retry three times and dead-letter.
      expect(destinations.some((to) => to.startsWith("deleted:"))).toBe(false);
      expect(destinations).toHaveLength(2);
    });

    it("worker path: no push job is queued for the deleted account", async () => {
      const deps = mockDeps();
      await handleNotificationBatch(batchJob(), deps);

      const pushed = pushUserIds(deps);
      expect(pushed).toContain(liveId);
      expect(pushed).not.toContain(deletedId);
    });

    it("inline path: the deleted member is not notified", async () => {
      // No boss: the fallback loop, which is what runs when the queue is not
      // configured.
      const inline = new NotificationService(db);
      await inline.notifyTripMembers({
        tripId,
        type: "trip_message",
        title: "New message",
        body: "hi",
      });

      const notified = await notifiedIds();
      expect(notified).toContain(organizerId);
      expect(notified).toContain(liveId);
      expect(notified).not.toContain(deletedId);
      expect(notified).toHaveLength(2);
    });
  });

  describe("getTripMembers roster", () => {
    it("organizer view: the tombstoned member has no phone number, the live ones are untouched", async () => {
      const roster = await invitationService.getTripMembers(
        tripId,
        organizerId,
      );

      const deleted = roster.find((m) => m.userId === deletedId);
      expect(deleted).toBeDefined();
      expect(deleted!.displayName).toBe(DELETED_DISPLAY_NAME);
      expect(deleted!.phoneNumber).toBeUndefined();

      expect(roster.find((m) => m.userId === organizerId)!.phoneNumber).toBe(
        organizerPhone,
      );
      expect(roster.find((m) => m.userId === liveId)!.phoneNumber).toBe(
        livePhone,
      );

      // Nothing anywhere in the payload, not just on that row.
      expect(JSON.stringify(roster)).not.toContain("deleted:");
    });

    it("sharePhone view: the live number comes through and the tombstone never does", async () => {
      // The deleted member's row still says `sharePhone = true` — deletion
      // does not touch the trip's member rows — so a viewer's entitlement is
      // not what stops it; the tombstone being masked is.
      const [deletedMemberRow] = await db
        .select({ sharePhone: members.sharePhone })
        .from(members)
        .where(and(eq(members.tripId, tripId), eq(members.userId, deletedId)));
      expect(deletedMemberRow!.sharePhone).toBe(true);

      const roster = await invitationService.getTripMembers(tripId, liveId);

      expect(
        roster.find((m) => m.userId === deletedId)!.phoneNumber,
      ).toBeUndefined();
      // The viewer's own shared number is unaffected.
      expect(roster.find((m) => m.userId === liveId)!.phoneNumber).toBe(
        livePhone,
      );
      expect(JSON.stringify(roster)).not.toContain("deleted:");
    });
  });

  describe("trip detail", () => {
    it("organizer payload: a tombstoned co-organizer carries no phone number", async () => {
      const detail = (await tripService.getTripById(tripId, organizerId))!;

      const deletedOrganizer = detail.organizers.find(
        (o) => o.id === deletedId,
      );
      expect(deletedOrganizer).toBeDefined();
      expect(deletedOrganizer!.displayName).toBe(DELETED_DISPLAY_NAME);
      expect(deletedOrganizer!.phoneNumber).toBeUndefined();

      expect(
        detail.organizers.find((o) => o.id === organizerId)!.phoneNumber,
      ).toBe(organizerPhone);

      expect(JSON.stringify(detail)).not.toContain("deleted:");
    });
  });
});
