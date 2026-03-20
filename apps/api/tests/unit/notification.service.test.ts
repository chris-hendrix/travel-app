import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  notifications,
  notificationPreferences,
} from "@/db/schema/index.js";
import { eq, or } from "drizzle-orm";
import { NotificationService } from "@/services/notification.service.js";
import { generateUniquePhone } from "../test-utils.js";
import { NotificationNotFoundError } from "@/errors.js";
import { QUEUE } from "@/queues/types.js";
import type { PgBoss } from "pg-boss";

// Create service instances with db for testing (no boss = fallback path)
const notificationService = new NotificationService(db);

describe("notification.service", () => {
  let testOrganizerPhone: string;
  let testMemberPhone: string;
  let testMember2Phone: string;

  let testOrganizerId: string;
  let testMemberId: string;
  let testMember2Id: string;

  let testTripId: string;

  // Clean up test data (safe for parallel execution)
  const cleanup = async () => {
    if (testTripId) {
      await db
        .delete(notifications)
        .where(eq(notifications.tripId, testTripId));
      await db
        .delete(notificationPreferences)
        .where(eq(notificationPreferences.tripId, testTripId));
      await db.delete(members).where(eq(members.tripId, testTripId));
      await db.delete(trips).where(eq(trips.id, testTripId));
    }

    const phoneNumbers = [
      testOrganizerPhone,
      testMemberPhone,
      testMember2Phone,
    ].filter(Boolean);

    if (phoneNumbers.length > 0) {
      // Clean up global notifications (no tripId) for test users
      // We need to get user IDs first
      const testUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(
          or(...phoneNumbers.map((phone) => eq(users.phoneNumber, phone))),
        );

      for (const u of testUsers) {
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
    // Generate unique phone numbers for this test run
    testOrganizerPhone = generateUniquePhone();
    testMemberPhone = generateUniquePhone();
    testMember2Phone = generateUniquePhone();

    // Clean up any existing data
    await cleanup();

    // Create test users
    const organizerResult = await db
      .insert(users)
      .values({
        phoneNumber: testOrganizerPhone,
        displayName: "Test Organizer",
        timezone: "UTC",
      })
      .returning();
    testOrganizerId = organizerResult[0].id;

    const memberResult = await db
      .insert(users)
      .values({
        phoneNumber: testMemberPhone,
        displayName: "Test Member",
        timezone: "UTC",
      })
      .returning();
    testMemberId = memberResult[0].id;

    const member2Result = await db
      .insert(users)
      .values({
        phoneNumber: testMember2Phone,
        displayName: "Test Member 2",
        timezone: "UTC",
      })
      .returning();
    testMember2Id = member2Result[0].id;

    // Create a test trip
    const tripResult = await db
      .insert(trips)
      .values({
        name: "Test Trip",
        destination: "Test Destination",
        preferredTimezone: "UTC",
        createdBy: testOrganizerId,
      })
      .returning();
    testTripId = tripResult[0].id;

    // Add organizer as member with status='going' and isOrganizer=true
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
  });

  afterEach(cleanup);

  describe("createNotification", () => {
    it("should create a notification and return it", async () => {
      const result = await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Trip Updated",
        body: "The trip destination has changed",
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.userId).toBe(testMemberId);
      expect(result.tripId).toBe(testTripId);
      expect(result.type).toBe("trip_update");
      expect(result.title).toBe("Trip Updated");
      expect(result.body).toBe("The trip destination has changed");
      expect(result.readAt).toBeNull();
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("should include all fields including data", async () => {
      const testData = { eventId: "abc-123", changedBy: "someone" };
      const result = await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Trip Update",
        body: "Trip details changed",
        data: testData,
      });

      expect(result.data).toEqual(testData);
      expect(result.readAt).toBeNull();
    });

    it("should create a notification without tripId (global notification)", async () => {
      const result = await notificationService.createNotification({
        userId: testMemberId,
        type: "trip_update",
        title: "Welcome",
        body: "Welcome to Journiful!",
      });

      expect(result.tripId).toBeNull();
      expect(result.title).toBe("Welcome");
    });
  });

  describe("getNotifications", () => {
    it("should return paginated results with correct meta", async () => {
      // Create 3 notifications
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Update 1",
        body: "Body 1",
      });
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Update 2",
        body: "Body 2",
      });
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Update 3",
        body: "Body 3",
      });

      const result = await notificationService.getNotifications(testMemberId, {
        limit: 2,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(3);
      expect(result.meta.limit).toBe(2);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.nextCursor).not.toBeNull();
    });

    it("should filter by tripId", async () => {
      // Create notification for test trip
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Trip Notification",
        body: "Body",
      });

      // Create a global notification (no tripId)
      await notificationService.createNotification({
        userId: testMemberId,
        type: "trip_update",
        title: "Global Notification",
        body: "Body",
      });

      const result = await notificationService.getNotifications(testMemberId, {
        limit: 20,
        tripId: testTripId,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe("Trip Notification");
    });

    it("should filter by unreadOnly", async () => {
      // Create 2 notifications
      const n1 = await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Read One",
        body: "Body",
      });
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Unread One",
        body: "Body",
      });

      // Mark one as read
      await notificationService.markAsRead(n1.id, testMemberId);

      const result = await notificationService.getNotifications(testMemberId, {
        limit: 20,
        unreadOnly: true,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe("Unread One");
      // meta.total should reflect the unread-only count, not all notifications
      expect(result.meta.total).toBe(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it("should return hasMore with unreadOnly and small limit", async () => {
      // Create 5 notifications
      for (let i = 1; i <= 5; i++) {
        await notificationService.createNotification({
          userId: testMemberId,
          tripId: testTripId,
          type: "trip_update",
          title: `Notification ${i}`,
          body: "Body",
        });
      }

      // Mark 3 as read (notifications 1, 2, 3)
      const allResult = await notificationService.getNotifications(
        testMemberId,
        { limit: 20 },
      );
      // Sorted DESC, so indices 2,3,4 correspond to notifications 1,2,3
      await notificationService.markAsRead(allResult.data[2].id, testMemberId);
      await notificationService.markAsRead(allResult.data[3].id, testMemberId);
      await notificationService.markAsRead(allResult.data[4].id, testMemberId);

      // Query unreadOnly with limit=1 -- should show 2 unread total, hasMore=true
      const result = await notificationService.getNotifications(testMemberId, {
        limit: 1,
        unreadOnly: true,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(2);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.nextCursor).not.toBeNull();
      expect(result.unreadCount).toBe(2);
    });

    it("should return unreadCount", async () => {
      const n1 = await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Notification 1",
        body: "Body",
      });
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Notification 2",
        body: "Body",
      });

      // Mark one as read
      await notificationService.markAsRead(n1.id, testMemberId);

      const result = await notificationService.getNotifications(testMemberId, {
        limit: 20,
      });

      expect(result.unreadCount).toBe(1);
    });

    it("should return empty when no notifications", async () => {
      const result = await notificationService.getNotifications(testMemberId, {
        limit: 20,
      });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.unreadCount).toBe(0);
    });

    it("should order by createdAt DESC", async () => {
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "First",
        body: "Body",
      });
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Second",
        body: "Body",
      });

      const result = await notificationService.getNotifications(testMemberId, {
        limit: 20,
      });

      expect(result.data[0].title).toBe("Second");
      expect(result.data[1].title).toBe("First");
    });
  });

  describe("getUnreadCount", () => {
    it("should return correct count of unread notifications", async () => {
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "N1",
        body: "Body",
      });
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "N2",
        body: "Body",
      });

      const count = await notificationService.getUnreadCount(testMemberId);
      expect(count).toBe(2);
    });

    it("should return 0 when all are read", async () => {
      const n1 = await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "N1",
        body: "Body",
      });

      await notificationService.markAsRead(n1.id, testMemberId);

      const count = await notificationService.getUnreadCount(testMemberId);
      expect(count).toBe(0);
    });
  });

  describe("getTripUnreadCount", () => {
    it("should return count scoped to specific trip", async () => {
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Trip N1",
        body: "Body",
      });

      const count = await notificationService.getTripUnreadCount(
        testMemberId,
        testTripId,
      );
      expect(count).toBe(1);
    });

    it("should return 0 for different trip", async () => {
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Trip N1",
        body: "Body",
      });

      const count = await notificationService.getTripUnreadCount(
        testMemberId,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(count).toBe(0);
    });
  });

  describe("markAsRead", () => {
    it("should mark notification as read (sets readAt)", async () => {
      const notification = await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "To Read",
        body: "Body",
      });

      await notificationService.markAsRead(notification.id, testMemberId);

      // Verify in DB
      const [updated] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notification.id));
      expect(updated.readAt).not.toBeNull();
      expect(updated.readAt).toBeInstanceOf(Date);
    });

    it("should throw NotificationNotFoundError for non-existent notification", async () => {
      await expect(
        notificationService.markAsRead(
          "00000000-0000-0000-0000-000000000000",
          testMemberId,
        ),
      ).rejects.toThrow(NotificationNotFoundError);
    });

    it("should throw NotificationNotFoundError for notification belonging to different user", async () => {
      const notification = await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Someone Else",
        body: "Body",
      });

      await expect(
        notificationService.markAsRead(notification.id, testOrganizerId),
      ).rejects.toThrow(NotificationNotFoundError);
    });
  });

  describe("markAllAsRead", () => {
    it("should mark all user notifications as read", async () => {
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "N1",
        body: "Body",
      });
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "N2",
        body: "Body",
      });

      await notificationService.markAllAsRead(testMemberId);

      const unreadCount =
        await notificationService.getUnreadCount(testMemberId);
      expect(unreadCount).toBe(0);
    });

    it("should scope to tripId when provided", async () => {
      // Create notification for test trip
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Trip N1",
        body: "Body",
      });

      // Create a global notification
      await notificationService.createNotification({
        userId: testMemberId,
        type: "trip_update",
        title: "Global N1",
        body: "Body",
      });

      // Mark only trip notifications as read
      await notificationService.markAllAsRead(testMemberId, testTripId);

      // Trip unread should be 0
      const tripUnread = await notificationService.getTripUnreadCount(
        testMemberId,
        testTripId,
      );
      expect(tripUnread).toBe(0);

      // Total unread should still be 1 (the global one)
      const totalUnread =
        await notificationService.getUnreadCount(testMemberId);
      expect(totalUnread).toBe(1);
    });

    it("should not affect other users notifications", async () => {
      await notificationService.createNotification({
        userId: testMemberId,
        tripId: testTripId,
        type: "trip_update",
        title: "Member N",
        body: "Body",
      });
      await notificationService.createNotification({
        userId: testOrganizerId,
        tripId: testTripId,
        type: "trip_update",
        title: "Organizer N",
        body: "Body",
      });

      // Mark all of member's as read
      await notificationService.markAllAsRead(testMemberId);

      // Organizer should still have unread
      const organizerUnread =
        await notificationService.getUnreadCount(testOrganizerId);
      expect(organizerUnread).toBe(1);
    });
  });

  describe("notifyTripMembers (fallback without boss)", () => {
    it("should create notifications for all going members", async () => {
      await notificationService.notifyTripMembers({
        tripId: testTripId,
        type: "trip_update",
        title: "Trip Changed",
        body: "Details changed",
      });

      // All 3 members (organizer + member + member2) should have notifications
      const orgCount =
        await notificationService.getUnreadCount(testOrganizerId);
      const memCount = await notificationService.getUnreadCount(testMemberId);
      const mem2Count = await notificationService.getUnreadCount(testMember2Id);

      expect(orgCount).toBe(1);
      expect(memCount).toBe(1);
      expect(mem2Count).toBe(1);
    });

    it("should exclude the specified user (excludeUserId)", async () => {
      await notificationService.notifyTripMembers({
        tripId: testTripId,
        type: "trip_update",
        title: "Trip Changed",
        body: "Details changed",
        excludeUserId: testOrganizerId,
      });

      // Organizer should NOT have a notification
      const orgCount =
        await notificationService.getUnreadCount(testOrganizerId);
      expect(orgCount).toBe(0);

      // Members should have notifications
      const memCount = await notificationService.getUnreadCount(testMemberId);
      const mem2Count = await notificationService.getUnreadCount(testMember2Id);
      expect(memCount).toBe(1);
      expect(mem2Count).toBe(1);
    });
  });

  describe("notifyTripMembers (with boss queue)", () => {
    it("should send payload to notification batch queue", async () => {
      const mockBoss = {
        send: vi.fn().mockResolvedValue("job-id"),
        insert: vi.fn().mockResolvedValue(undefined),
      } as unknown as PgBoss;
      const serviceWithBoss = new NotificationService(db, mockBoss);

      await serviceWithBoss.notifyTripMembers({
        tripId: testTripId,
        type: "trip_update",
        title: "Trip Changed",
        body: "Details changed",
        data: { eventId: "e1" },
        excludeUserId: testOrganizerId,
      });

      expect(mockBoss.send).toHaveBeenCalledOnce();
      expect(mockBoss.send).toHaveBeenCalledWith(QUEUE.NOTIFICATION_BATCH, {
        tripId: testTripId,
        type: "trip_update",
        title: "Trip Changed",
        body: "Details changed",
        data: { eventId: "e1" },
        excludeUserId: testOrganizerId,
      });
    });

    it("should not create inline DB notifications when boss is available", async () => {
      const mockBoss = {
        send: vi.fn().mockResolvedValue("job-id"),
        insert: vi.fn().mockResolvedValue(undefined),
      } as unknown as PgBoss;
      const serviceWithBoss = new NotificationService(db, mockBoss);

      await serviceWithBoss.notifyTripMembers({
        tripId: testTripId,
        type: "trip_update",
        title: "Trip Changed",
        body: "Details changed",
      });

      // No inline notifications should be created -- the queue worker handles that
      const orgCount = await serviceWithBoss.getUnreadCount(testOrganizerId);
      const memCount = await serviceWithBoss.getUnreadCount(testMemberId);
      const mem2Count = await serviceWithBoss.getUnreadCount(testMember2Id);

      expect(orgCount).toBe(0);
      expect(memCount).toBe(0);
      expect(mem2Count).toBe(0);
    });

    it("should handle optional data and excludeUserId fields", async () => {
      const mockBoss = {
        send: vi.fn().mockResolvedValue("job-id"),
        insert: vi.fn().mockResolvedValue(undefined),
      } as unknown as PgBoss;
      const serviceWithBoss = new NotificationService(db, mockBoss);

      await serviceWithBoss.notifyTripMembers({
        tripId: testTripId,
        type: "trip_update",
        title: "Trip Changed",
        body: "Details changed",
      });

      expect(mockBoss.send).toHaveBeenCalledWith(QUEUE.NOTIFICATION_BATCH, {
        tripId: testTripId,
        type: "trip_update",
        title: "Trip Changed",
        body: "Details changed",
        data: undefined,
        excludeUserId: undefined,
      });
    });
  });

  describe("getPreferences", () => {
    it("should return stored preferences", async () => {
      await notificationService.updatePreferences(testMemberId, testTripId, {
        dailyItinerary: true,
        tripMessages: false,
      });

      const prefs = await notificationService.getPreferences(
        testMemberId,
        testTripId,
      );

      expect(prefs.dailyItinerary).toBe(true);
      expect(prefs.tripMessages).toBe(false);
    });

    it("should return defaults when no preferences exist", async () => {
      const prefs = await notificationService.getPreferences(
        testMemberId,
        testTripId,
      );

      expect(prefs.dailyItinerary).toBe(true);
      expect(prefs.tripMessages).toBe(true);
    });
  });

  describe("updatePreferences", () => {
    it("should create preferences when none exist (upsert insert)", async () => {
      const result = await notificationService.updatePreferences(
        testMemberId,
        testTripId,
        {
          dailyItinerary: false,
          tripMessages: true,
        },
      );

      expect(result.dailyItinerary).toBe(false);
      expect(result.tripMessages).toBe(true);

      // Verify in DB
      const prefs = await notificationService.getPreferences(
        testMemberId,
        testTripId,
      );
      expect(prefs.dailyItinerary).toBe(false);
      expect(prefs.tripMessages).toBe(true);
    });

    it("should update existing preferences (upsert update)", async () => {
      // Create initial preferences
      await notificationService.updatePreferences(testMemberId, testTripId, {
        dailyItinerary: true,
        tripMessages: true,
      });

      // Update them
      const result = await notificationService.updatePreferences(
        testMemberId,
        testTripId,
        {
          dailyItinerary: false,
          tripMessages: false,
        },
      );

      expect(result.dailyItinerary).toBe(false);
      expect(result.tripMessages).toBe(false);

      // Verify in DB
      const prefs = await notificationService.getPreferences(
        testMemberId,
        testTripId,
      );
      expect(prefs.dailyItinerary).toBe(false);
      expect(prefs.tripMessages).toBe(false);
    });

    it("should return the updated values", async () => {
      const prefs = {
        dailyItinerary: false,
        tripMessages: true,
      };

      const result = await notificationService.updatePreferences(
        testMemberId,
        testTripId,
        prefs,
      );

      expect(result).toEqual(prefs);
    });
  });

  describe("createDefaultPreferences", () => {
    it("should create default preferences", async () => {
      await notificationService.createDefaultPreferences(
        testMemberId,
        testTripId,
      );

      const prefs = await notificationService.getPreferences(
        testMemberId,
        testTripId,
      );

      expect(prefs.dailyItinerary).toBe(true);
      expect(prefs.tripMessages).toBe(true);
    });

    it("should be idempotent (does not fail if already exists)", async () => {
      await notificationService.createDefaultPreferences(
        testMemberId,
        testTripId,
      );

      // Update preferences to non-default values
      await notificationService.updatePreferences(testMemberId, testTripId, {
        dailyItinerary: false,
        tripMessages: false,
      });

      // Calling createDefault again should NOT overwrite
      await notificationService.createDefaultPreferences(
        testMemberId,
        testTripId,
      );

      // Preferences should still be the updated (non-default) values
      const prefs = await notificationService.getPreferences(
        testMemberId,
        testTripId,
      );
      expect(prefs.dailyItinerary).toBe(false);
      expect(prefs.tripMessages).toBe(false);
    });
  });
});
