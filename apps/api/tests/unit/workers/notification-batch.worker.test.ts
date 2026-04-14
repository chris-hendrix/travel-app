import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Job } from "pg-boss";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  notifications,
  notificationPreferences,
  sentReminders,
} from "@/db/schema/index.js";
import { eq, or } from "drizzle-orm";
import {
  handleNotificationBatch,
  getPreferenceField,
  shouldSendSms,
} from "@/queues/workers/notification-batch.worker.js";
import type { NotificationBatchPayload, WorkerDeps } from "@/queues/types.js";
import { QUEUE } from "@/queues/types.js";
import { SMSService } from "@/services/sms.service.js";
import { generateUniquePhone } from "../../test-utils.js";

describe("notification-batch.worker", () => {
  let testOrganizerPhone: string;
  let testMemberPhone: string;
  let testMember2Phone: string;

  let testOrganizerId: string;
  let testMemberId: string;
  let testMember2Id: string;

  let testTripId: string;

  let mockDeps: WorkerDeps;

  const cleanup = async () => {
    const phoneNumbers = [
      testOrganizerPhone,
      testMemberPhone,
      testMember2Phone,
    ].filter(Boolean);

    if (testTripId) {
      if (phoneNumbers.length > 0) {
        const testUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(
            or(...phoneNumbers.map((phone) => eq(users.phoneNumber, phone))),
          );
        for (const u of testUsers) {
          await db.delete(sentReminders).where(eq(sentReminders.userId, u.id));
        }
      }

      await db
        .delete(notifications)
        .where(eq(notifications.tripId, testTripId));
      await db
        .delete(notificationPreferences)
        .where(eq(notificationPreferences.tripId, testTripId));
      await db.delete(members).where(eq(members.tripId, testTripId));
      await db.delete(trips).where(eq(trips.id, testTripId));
    }

    if (phoneNumbers.length > 0) {
      const testUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(
          or(...phoneNumbers.map((phone) => eq(users.phoneNumber, phone))),
        );

      for (const u of testUsers) {
        await db.delete(sentReminders).where(eq(sentReminders.userId, u.id));
        await db.delete(notifications).where(eq(notifications.userId, u.id));
      }

      await db
        .delete(users)
        .where(
          or(...phoneNumbers.map((phone) => eq(users.phoneNumber, phone))),
        );
    }
  };

  beforeEach(async () => {
    testOrganizerPhone = generateUniquePhone();
    testMemberPhone = generateUniquePhone();
    testMember2Phone = generateUniquePhone();

    await cleanup();

    // Create test users
    const organizerResult = await db
      .insert(users)
      .values({
        phoneNumber: testOrganizerPhone,
        displayName: "Batch Organizer",
        timezone: "UTC",
      })
      .returning();
    testOrganizerId = organizerResult[0].id;

    const memberResult = await db
      .insert(users)
      .values({
        phoneNumber: testMemberPhone,
        displayName: "Batch Member",
        timezone: "UTC",
      })
      .returning();
    testMemberId = memberResult[0].id;

    const member2Result = await db
      .insert(users)
      .values({
        phoneNumber: testMember2Phone,
        displayName: "Batch Member 2",
        timezone: "UTC",
      })
      .returning();
    testMember2Id = member2Result[0].id;

    // Create a test trip
    const tripResult = await db
      .insert(trips)
      .values({
        name: "Batch Test Trip",
        destination: "Test Destination",
        preferredTimezone: "UTC",
        createdBy: testOrganizerId,
      })
      .returning();
    testTripId = tripResult[0].id;

    // Add organizer as member with status='going'
    await db.insert(members).values({
      tripId: testTripId,
      userId: testOrganizerId,
      status: "going",
      isOrganizer: true,
    });

    // Add regular member with status='going'
    await db.insert(members).values({
      tripId: testTripId,
      userId: testMemberId,
      status: "going",
    });

    // Add second member with status='going'
    await db.insert(members).values({
      tripId: testTripId,
      userId: testMember2Id,
      status: "going",
    });

    mockDeps = {
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
    };
  });

  afterEach(cleanup);

  function createMockJob(
    overrides: Partial<NotificationBatchPayload> = {},
  ): Job<NotificationBatchPayload> {
    return {
      id: "test-job-id",
      name: "notification/batch",
      data: {
        tripId: testTripId,
        type: "trip_message",
        title: "Test Title",
        body: "Test Body",
        ...overrides,
      },
      expireInSeconds: 300,
      heartbeatSeconds: null,
      signal: new AbortController().signal,
    } as Job<NotificationBatchPayload>;
  }

  describe("getPreferenceField", () => {
    it("should return dailyItinerary for daily_itinerary type", () => {
      expect(getPreferenceField("daily_itinerary")).toBe("dailyItinerary");
    });

    it("should return tripMessages for trip_message type", () => {
      expect(getPreferenceField("trip_message")).toBe("tripMessages");
    });

    it("should return null for unknown type", () => {
      expect(getPreferenceField("trip_update")).toBeNull();
      expect(getPreferenceField("unknown")).toBeNull();
    });
  });

  describe("shouldSendSms", () => {
    const allEnabledPrefs = {
      dailyItinerary: true,
      tripMessages: true,
    };

    it("should always return true for trip_update regardless of prefs", () => {
      expect(
        shouldSendSms("trip_update", {
          dailyItinerary: false,
          tripMessages: false,
        }),
      ).toBe(true);
    });

    it("should return true for unknown type", () => {
      expect(shouldSendSms("some_unknown_type", allEnabledPrefs)).toBe(true);
    });

    it("should respect dailyItinerary preference", () => {
      expect(
        shouldSendSms("daily_itinerary", {
          ...allEnabledPrefs,
          dailyItinerary: false,
        }),
      ).toBe(false);
      expect(shouldSendSms("daily_itinerary", allEnabledPrefs)).toBe(true);
    });

    it("should respect tripMessages preference", () => {
      expect(
        shouldSendSms("trip_message", {
          ...allEnabledPrefs,
          tripMessages: false,
        }),
      ).toBe(false);
      expect(shouldSendSms("trip_message", allEnabledPrefs)).toBe(true);
    });
  });

  describe("handleNotificationBatch", () => {
    it("should create notifications for all going members", async () => {
      const job = createMockJob();

      await handleNotificationBatch(job, mockDeps);

      // All 3 going members should have notifications
      const orgNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testOrganizerId));
      const memNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testMemberId));
      const mem2Notifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testMember2Id));

      expect(orgNotifs).toHaveLength(1);
      expect(memNotifs).toHaveLength(1);
      expect(mem2Notifs).toHaveLength(1);

      expect(orgNotifs[0].type).toBe("trip_message");
      expect(orgNotifs[0].title).toBe("Test Title");
      expect(orgNotifs[0].body).toBe("Test Body");
      expect(orgNotifs[0].tripId).toBe(testTripId);
    });

    it("should only notify going members, not maybe or not_going", async () => {
      // Change member2 to 'maybe'
      await db
        .update(members)
        .set({ status: "maybe" })
        .where(eq(members.userId, testMember2Id));

      const job = createMockJob();

      await handleNotificationBatch(job, mockDeps);

      // member2 should NOT have a notification
      const mem2Notifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testMember2Id));
      expect(mem2Notifs).toHaveLength(0);

      // organizer and member should have notifications
      const orgNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testOrganizerId));
      const memNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testMemberId));
      expect(orgNotifs).toHaveLength(1);
      expect(memNotifs).toHaveLength(1);
    });

    it("should filter out excludeUserId", async () => {
      const job = createMockJob({ excludeUserId: testOrganizerId });

      await handleNotificationBatch(job, mockDeps);

      // Organizer should NOT have a notification
      const orgNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testOrganizerId));
      expect(orgNotifs).toHaveLength(0);

      // Members should have notifications
      const memNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testMemberId));
      const mem2Notifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testMember2Id));
      expect(memNotifs).toHaveLength(1);
      expect(mem2Notifs).toHaveLength(1);
    });

    it("should enqueue SMS delivery jobs via boss.insert", async () => {
      const job = createMockJob({ type: "trip_update" });

      await handleNotificationBatch(job, mockDeps);

      // SMS + push deliver = 2 calls
      expect(mockDeps.boss.insert).toHaveBeenCalledTimes(2);
      expect(mockDeps.boss.insert).toHaveBeenCalledWith(
        QUEUE.NOTIFICATION_DELIVER,
        expect.arrayContaining([
          expect.objectContaining({
            data: {
              phoneNumber: testOrganizerPhone,
              message: "Test Title: Test Body",
            },
          }),
          expect.objectContaining({
            data: {
              phoneNumber: testMemberPhone,
              message: "Test Title: Test Body",
            },
          }),
          expect.objectContaining({
            data: {
              phoneNumber: testMember2Phone,
              message: "Test Title: Test Body",
            },
          }),
        ]),
      );
      expect(mockDeps.boss.insert).toHaveBeenCalledWith(
        QUEUE.PUSH_DELIVER,
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({ userId: testOrganizerId }),
          }),
        ]),
      );
    });

    it("should not enqueue SMS for members with disabled preference", async () => {
      // Disable tripMessages for testMemberId
      await db
        .insert(notificationPreferences)
        .values({
          userId: testMemberId,
          tripId: testTripId,
          dailyItinerary: true,
          tripMessages: false,
        })
        .onConflictDoNothing();

      const job = createMockJob({ type: "trip_message" });

      await handleNotificationBatch(job, mockDeps);

      // Notification should still be created for testMemberId
      const memNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testMemberId));
      expect(memNotifs).toHaveLength(1);

      // SMS jobs should not include testMemberPhone
      const smsInsertCall = vi
        .mocked(mockDeps.boss.insert)
        .mock.calls.find((c) => c[0] === QUEUE.NOTIFICATION_DELIVER)!;
      const smsJobs = smsInsertCall[1] as { data: { phoneNumber: string } }[];
      const smsPhones = smsJobs.map((j) => j.data.phoneNumber);

      expect(smsPhones).not.toContain(testMemberPhone);
      // Others should still get SMS (default prefs = enabled)
      expect(smsPhones).toContain(testOrganizerPhone);
      expect(smsPhones).toContain(testMember2Phone);
    });

    it("should always enqueue SMS for trip_update even if prefs are disabled", async () => {
      // Disable all prefs for testMemberId
      await db
        .insert(notificationPreferences)
        .values({
          userId: testMemberId,
          tripId: testTripId,
          dailyItinerary: false,
          tripMessages: false,
        })
        .onConflictDoNothing();

      const job = createMockJob({ type: "trip_update" });

      await handleNotificationBatch(job, mockDeps);

      // SMS should still be enqueued for all members including testMemberId
      const smsInsertCall = vi
        .mocked(mockDeps.boss.insert)
        .mock.calls.find((c) => c[0] === QUEUE.NOTIFICATION_DELIVER)!;
      const smsJobs = smsInsertCall[1] as { data: { phoneNumber: string } }[];
      const smsPhones = smsJobs.map((j) => j.data.phoneNumber);

      expect(smsPhones).toContain(testMemberPhone);
      expect(smsPhones).toContain(testOrganizerPhone);
      expect(smsPhones).toContain(testMember2Phone);
    });

    it("should deduplicate cron types using sentReminders", async () => {
      const referenceId = `daily-123`;

      // Pre-insert a sentReminder for testMemberId
      await db.insert(sentReminders).values({
        type: "daily_itinerary",
        referenceId,
        userId: testMemberId,
      });

      const job = createMockJob({
        type: "daily_itinerary",
        data: { referenceId },
      });

      await handleNotificationBatch(job, mockDeps);

      // testMemberId should NOT get a notification (already sent)
      const memNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testMemberId));
      expect(memNotifs).toHaveLength(0);

      // Others should get notifications
      const orgNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testOrganizerId));
      const mem2Notifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testMember2Id));
      expect(orgNotifs).toHaveLength(1);
      expect(mem2Notifs).toHaveLength(1);
    });

    it("should insert sentReminders for cron types", async () => {
      const referenceId = `daily-456`;

      const job = createMockJob({
        type: "daily_itinerary",
        data: { referenceId },
      });

      await handleNotificationBatch(job, mockDeps);

      // sentReminders should have entries for all 3 members
      const reminders = await db
        .select()
        .from(sentReminders)
        .where(eq(sentReminders.referenceId, referenceId));

      expect(reminders).toHaveLength(3);
      const reminderUserIds = reminders.map((r) => r.userId);
      expect(reminderUserIds).toContain(testOrganizerId);
      expect(reminderUserIds).toContain(testMemberId);
      expect(reminderUserIds).toContain(testMember2Id);
    });

    it("should not insert sentReminders for non-cron types", async () => {
      const job = createMockJob({
        type: "trip_message",
        data: { referenceId: "msg-123" },
      });

      await handleNotificationBatch(job, mockDeps);

      // No sentReminders should be created for trip_message
      const reminders = await db
        .select()
        .from(sentReminders)
        .where(eq(sentReminders.referenceId, "msg-123"));
      expect(reminders).toHaveLength(0);
    });

    it("should do nothing when no going members exist", async () => {
      // Change all members to not_going
      await db
        .update(members)
        .set({ status: "not_going" })
        .where(eq(members.tripId, testTripId));

      const job = createMockJob();

      await handleNotificationBatch(job, mockDeps);

      // No notifications should be created
      const allNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.tripId, testTripId));
      expect(allNotifs).toHaveLength(0);

      // No boss.insert calls
      expect(mockDeps.boss.insert).not.toHaveBeenCalled();
    });

    it("should do nothing when all going members are excluded", async () => {
      // Remove member and member2 from going
      await db
        .update(members)
        .set({ status: "not_going" })
        .where(eq(members.userId, testMemberId));
      await db
        .update(members)
        .set({ status: "not_going" })
        .where(eq(members.userId, testMember2Id));

      // Exclude the only remaining going member (organizer)
      const job = createMockJob({ excludeUserId: testOrganizerId });

      await handleNotificationBatch(job, mockDeps);

      const allNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.tripId, testTripId));
      expect(allNotifs).toHaveLength(0);

      expect(mockDeps.boss.insert).not.toHaveBeenCalled();
    });

    it("should store notification data field correctly", async () => {
      const testData = { eventId: "abc-123", changedBy: "someone" };
      const job = createMockJob({ data: testData });

      await handleNotificationBatch(job, mockDeps);

      const memNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testMemberId));
      expect(memNotifs).toHaveLength(1);
      expect(memNotifs[0].data).toEqual(testData);
    });

    it("should not call boss.insert when all members have SMS disabled", async () => {
      // Disable tripMessages for all members
      for (const userId of [testOrganizerId, testMemberId, testMember2Id]) {
        await db
          .insert(notificationPreferences)
          .values({
            userId,
            tripId: testTripId,
            dailyItinerary: true,
            tripMessages: false,
          })
          .onConflictDoNothing();
      }

      const job = createMockJob({ type: "trip_message" });

      await handleNotificationBatch(job, mockDeps);

      // Notifications should still be created
      const allNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.tripId, testTripId));
      expect(allNotifs).toHaveLength(3);

      // But no SMS should be enqueued
      expect(mockDeps.boss.insert).not.toHaveBeenCalled();
    });
  });
});
