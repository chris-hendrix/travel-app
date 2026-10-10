import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Job } from "pg-boss";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  notifications,
  sentReminders,
  userBlocks,
  userReports,
} from "@/db/schema/index.js";
import { and, eq, inArray } from "drizzle-orm";
import {
  ModerationService,
  blockedCounterpartIds,
  withoutBlocked,
} from "@/services/moderation.service.js";
import { InvitationService } from "@/services/invitation.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { NotificationService } from "@/services/notification.service.js";
import { SMSService } from "@/services/sms.service.js";
import { handleNotificationBatch } from "@/queues/workers/notification-batch.worker.js";
import type { NotificationBatchPayload, WorkerDeps } from "@/queues/types.js";
import { generateUniquePhone } from "../test-utils.js";

/**
 * Task 31 RED: the schema, and the pair's effect.
 *
 * A block is a row in `user_blocks` that is symmetric in meaning even though
 * it is directed in storage: whichever side wrote it, the two do not see each
 * other. The row is enforced in the three places a client would otherwise feel
 * it — the roster `getTripMembers` returns, and both fan-out paths (the batch
 * worker and the inline fallback) — plus the report row that outlives its trip.
 */
describe("moderation.service (Task 31)", () => {
  let moderation: ModerationService;
  let invitationService: InvitationService;
  let notificationService: NotificationService;

  let blockerId: string;
  let blockedId: string;
  let otherId: string;
  let tripId: string;
  let guestMemberId: string;
  let phones: string[] = [];

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

  const cleanup = async () => {
    if (phones.length > 0) {
      const testUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.phoneNumber, phones));
      const ids = testUsers.map((u) => u.id);

      if (tripId) {
        await db.delete(notifications).where(eq(notifications.tripId, tripId));
        await db
          .delete(sentReminders)
          .where(inArray(sentReminders.userId, ids));
      }
      if (ids.length > 0) {
        await db.delete(userReports).where(inArray(userReports.reporterId, ids));
        await db
          .delete(userReports)
          .where(inArray(userReports.reportedId, ids));
        await db.delete(userBlocks).where(inArray(userBlocks.blockerId, ids));
        await db.delete(userBlocks).where(inArray(userBlocks.blockedId, ids));
        await db.delete(notifications).where(inArray(notifications.userId, ids));
      }
    }

    if (tripId) {
      // members before trips (FK), and the trip's reports go with it
      await db.delete(members).where(eq(members.tripId, tripId));
      await db
        .delete(userReports)
        .where(eq(userReports.tripId, tripId));
      await db.delete(trips).where(eq(trips.id, tripId));
    }

    if (phones.length > 0) {
      await db.delete(users).where(inArray(users.phoneNumber, phones));
    }
  };

  beforeEach(async () => {
    phones = [generateUniquePhone(), generateUniquePhone(), generateUniquePhone()];
    await cleanup();

    moderation = new ModerationService(db);
    notificationService = new NotificationService(db);
    invitationService = new InvitationService(
      db,
      new PermissionsService(db),
      new SMSService(),
      notificationService,
    );

    const [a, b, c] = await db
      .insert(users)
      .values([
        { phoneNumber: phones[0]!, displayName: "Blocker" },
        { phoneNumber: phones[1]!, displayName: "Blocked" },
        { phoneNumber: phones[2]!, displayName: "Unrelated" },
      ])
      .returning();
    blockerId = a!.id;
    blockedId = b!.id;
    otherId = c!.id;

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Moderation Trip",
        destination: "Naples",
        preferredTimezone: "Europe/Rome",
        createdBy: blockerId,
      })
      .returning();
    tripId = trip!.id;

    await db.insert(members).values([
      { tripId, userId: blockerId, status: "going", isOrganizer: true },
      { tripId, userId: blockedId, status: "going" },
      { tripId, userId: otherId, status: "going" },
      { tripId, userId: null, guestDisplayName: "Guest Mom", status: "going" },
    ]);

    const [guest] = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(eq(members.tripId, tripId), eq(members.guestDisplayName, "Guest Mom")),
      );
    guestMemberId = guest!.id;
  });

  afterEach(async () => {
    await cleanup();
    tripId = "";
  });

  describe("blocking", () => {
    it("writes one row, and blocking the same pair twice is idempotent", async () => {
      await moderation.blockUser(blockerId, blockedId);
      await moderation.blockUser(blockerId, blockedId);

      // Scoped to this test's blocker, never the whole table: the suite
      // shares one database and another file's blocks are not this
      // file's evidence.
      const rows = await db
        .select()
        .from(userBlocks)
        .where(eq(userBlocks.blockerId, blockerId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.blockerId).toBe(blockerId);
      expect(rows[0]!.blockedId).toBe(blockedId);
      expect(rows[0]!.createdAt).toBeInstanceOf(Date);
    });

    it("treats the pair as blocked from either direction", async () => {
      await moderation.blockUser(blockerId, blockedId);

      expect(await moderation.isBlocked(blockerId, blockedId)).toBe(true);
      expect(await moderation.isBlocked(blockedId, blockerId)).toBe(true);
      expect(await moderation.isBlocked(blockerId, otherId)).toBe(false);

      expect(await moderation.listBlockedBy(blockerId)).toEqual([blockedId]);
      expect(await moderation.listBlockedBy(blockedId)).toEqual([]);

      await moderation.unblockUser(blockerId, blockedId);
      expect(await moderation.isBlocked(blockerId, blockedId)).toBe(false);
      expect(
        await db
          .select()
          .from(userBlocks)
          .where(eq(userBlocks.blockerId, blockerId)),
      ).toHaveLength(0);
    });

    it("refuses to block yourself and writes nothing", async () => {
      await expect(moderation.blockUser(blockerId, blockerId)).rejects.toThrow();
      expect(
        await db
          .select()
          .from(userBlocks)
          .where(eq(userBlocks.blockerId, blockerId)),
      ).toHaveLength(0);
    });
  });

  describe("blockedCounterpartIds / withoutBlocked", () => {
    it("collects the other side of every block in either direction", async () => {
      await moderation.blockUser(blockerId, blockedId);
      await moderation.blockUser(otherId, blockerId);

      const forBlocker = await blockedCounterpartIds(db, blockerId);
      expect(forBlocker.has(blockedId)).toBe(true);
      expect(forBlocker.has(otherId)).toBe(true);
      // not the user itself
      expect(forBlocker.has(blockerId)).toBe(false);

      expect(await blockedCounterpartIds(db, otherId)).toEqual(
        new Set([blockerId]),
      );
      // The blocked user reads the same relation: the pair is symmetric, so
      // the blocker is the counterpart either way round.
      expect(await blockedCounterpartIds(db, blockedId)).toEqual(
        new Set([blockerId]),
      );
    });

    it("drops blocked recipients and passes guests (null userId)", () => {
      const recipients = [
        { userId: "a" },
        { userId: "b" },
        { userId: null },
      ];
      expect(withoutBlocked(recipients, new Set(["b"]))).toEqual([
        { userId: "a" },
        { userId: null },
      ]);
    });
  });

  describe("getTripMembers roster", () => {
    it("drops the blocked row in both directions and leaves the rest intact", async () => {
      await moderation.blockUser(blockerId, blockedId);

      // Blocked reads the roster: no blocker row.
      const asBlocked = await invitationService.getTripMembers(
        tripId,
        blockedId,
      );
      expect(asBlocked.map((m) => m.userId)).not.toContain(blockerId);
      expect(asBlocked.map((m) => m.userId)).toContain(otherId);
      // The guest row is untouched by a user-to-user block.
      expect(asBlocked.some((m) => m.id === guestMemberId)).toBe(true);

      // Blocker reads the roster: no blocked row.
      const asBlocker = await invitationService.getTripMembers(
        tripId,
        blockerId,
      );
      expect(asBlocker.map((m) => m.userId)).not.toContain(blockedId);
      expect(asBlocker.map((m) => m.userId)).toContain(otherId);
      expect(asBlocker.some((m) => m.id === guestMemberId)).toBe(true);

      // Everything else about a surviving row is unchanged: the unrelated
      // member keeps every field the organizer view gives it.
      const orgView = asBlocker.find((m) => m.userId === otherId)!;
      expect(orgView.id).toBeTruthy();
      expect(orgView.displayName).toBe("Unrelated");
      expect(orgView.status).toBe("going");
      expect(orgView.isOrganizer).toBe(false);
      expect(orgView.isMuted).toBe(false);
      expect(orgView.phoneNumber).toBe(phones[2]!);
      expect(typeof orgView.createdAt).toBe("string");
    });

    it("shows the whole roster when nobody is blocked", async () => {
      const roster = await invitationService.getTripMembers(tripId, blockerId);
      expect(roster.map((m) => m.userId).sort()).toEqual(
        [blockerId, blockedId, otherId, null].sort(),
      );
    });
  });

  describe("notification fan-out", () => {
    const batchJob = (
      overrides: Partial<NotificationBatchPayload> = {},
    ): Job<NotificationBatchPayload> =>
      ({
        id: "moderation-job",
        name: "notification/batch",
        data: {
          tripId,
          type: "trip_message",
          title: "New message",
          body: "hi",
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

    it("worker path: skips the blocked pair in both directions", async () => {
      // Blocker wrote the row; the actor is the blocked user, so the
      // recipient that must be dropped is the blocker.
      await moderation.blockUser(blockerId, blockedId);
      await handleNotificationBatch(
        batchJob({ actorUserId: blockedId, excludeUserId: blockedId }),
        mockDeps(),
      );

      const notified = await notifiedIds();
      expect(notified).not.toContain(blockerId);
      expect(notified).toContain(otherId);
      expect(notified).not.toContain(blockedId); // the actor
      expect(notified).toHaveLength(1);
    });

    it("worker path: skips the blocker's counterpart when the blocker is the actor", async () => {
      await moderation.blockUser(blockerId, blockedId);
      await handleNotificationBatch(
        batchJob({ actorUserId: blockerId }),
        mockDeps(),
      );

      const notified = await notifiedIds();
      expect(notified).not.toContain(blockedId);
      expect(notified).toContain(otherId);
    });

    it("worker path: an older job with no actorUserId behaves exactly as before", async () => {
      await moderation.blockUser(blockerId, blockedId);
      await handleNotificationBatch(batchJob(), mockDeps());

      const notified = await notifiedIds();
      expect(notified.sort()).toEqual([blockerId, blockedId, otherId].sort());
    });

    it("inline path: skips the blocked pair in both directions", async () => {
      await moderation.blockUser(blockerId, blockedId);
      await notificationService.notifyTripMembers({
        tripId,
        type: "trip_message",
        title: "New message",
        body: "hi",
        excludeUserId: blockedId,
        actorUserId: blockedId,
      });

      const notified = await notifiedIds();
      expect(notified).not.toContain(blockerId);
      expect(notified).toContain(otherId);
      expect(notified).not.toContain(blockedId);
    });

    it("inline path: the counterpart is dropped even when the blocker is the actor", async () => {
      await moderation.blockUser(blockerId, blockedId);
      await notificationService.notifyTripMembers({
        tripId,
        type: "trip_cancelled",
        title: "Trip deleted",
        body: "gone",
        excludeUserId: blockerId,
        actorUserId: blockerId,
      });

      const notified = await notifiedIds();
      expect(notified).not.toContain(blockedId);
      expect(notified).toContain(otherId);
    });

    it("inline path: with no blocks the fan-out is unchanged", async () => {
      await notificationService.notifyTripMembers({
        tripId,
        type: "trip_message",
        title: "New message",
        body: "hi",
        excludeUserId: blockedId,
        actorUserId: blockedId,
      });

      const notified = await notifiedIds();
      expect(notified.sort()).toEqual([blockerId, otherId].sort());
    });
  });

  describe("reports", () => {
    it("stores reporter, reported, optional trip, reason, note and an open status", async () => {
      const withTrip = await moderation.reportUser({
        reporterId: blockedId,
        reportedId: blockerId,
        tripId,
        reason: "harassment",
        note: "kept messaging after a no",
      });

      expect(withTrip.reporterId).toBe(blockedId);
      expect(withTrip.reportedId).toBe(blockerId);
      expect(withTrip.tripId).toBe(tripId);
      expect(withTrip.reason).toBe("harassment");
      expect(withTrip.note).toBe("kept messaging after a no");
      expect(withTrip.status).toBe("open");

      const [stored] = await db
        .select()
        .from(userReports)
        .where(eq(userReports.id, withTrip.id));
      expect(stored!.reason).toBe("harassment");
      expect(stored!.status).toBe("open");

      // A report outlives its trip: deleting the trip nulls the column, the
      // row stays.
      await db.delete(members).where(eq(members.tripId, tripId));
      await db.delete(trips).where(eq(trips.id, tripId));
      tripId = "";

      const [orphan] = await db
        .select()
        .from(userReports)
        .where(eq(userReports.id, withTrip.id));
      expect(orphan).toBeDefined();
      expect(orphan!.tripId).toBeNull();
    });

    it("accepts a report with no trip and no note", async () => {
      const report = await moderation.reportUser({
        reporterId: blockedId,
        reportedId: otherId,
        reason: "spam",
      });
      expect(report.tripId).toBeNull();
      expect(report.note).toBeNull();
      expect(report.status).toBe("open");
    });

    it("refuses to report yourself and writes nothing", async () => {
      await expect(
        moderation.reportUser({
          reporterId: blockerId,
          reportedId: blockerId,
          reason: "other",
        }),
      ).rejects.toThrow();
      expect(
        await db
          .select()
          .from(userReports)
          .where(eq(userReports.reporterId, blockerId)),
      ).toHaveLength(0);
    });
  });
});