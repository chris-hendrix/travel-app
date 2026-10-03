import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  notifications,
  notificationPreferences,
} from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";

describe("Notification Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  // --- Helper to create a test user, trip, and member ---
  async function createTestData() {
    const [testUser] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: "Test User",
        timezone: "UTC",
      })
      .returning();

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Test Trip",
        destination: "Paris",
        preferredTimezone: "UTC",
        createdBy: testUser.id,
      })
      .returning();

    await db.insert(members).values({
      tripId: trip.id,
      userId: testUser.id,
      status: "going",
      isOrganizer: true,
    });

    return { testUser, trip };
  }

  // --- Helper to create a notification ---
  async function createNotification(
    userId: string,
    tripId: string | null,
    opts?: { readAt?: Date },
  ) {
    const [notification] = await db
      .insert(notifications)
      .values({
        userId,
        tripId,
        type: "trip_update",
        title: "Test Notification",
        body: "This is a test notification",
        readAt: opts?.readAt ?? null,
      })
      .returning();

    return notification;
  }

  describe("GET /api/notifications", () => {
    it("should return paginated notifications with 200", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      // Create 3 notifications
      await createNotification(testUser.id, trip.id);
      await createNotification(testUser.id, trip.id);
      await createNotification(testUser.id, trip.id);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/notifications?limit=2",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("notifications");
      expect(body.notifications).toHaveLength(2);
      expect(body).toHaveProperty("meta");
      expect(body.meta).toMatchObject({
        total: 3,
        limit: 2,
        hasMore: true,
      });
      expect(body.meta.nextCursor).not.toBeNull();
      expect(body).toHaveProperty("unreadCount", 3);
    });

    // Contract, not validation: `notificationListResponseSchema` is the
    // 200 response schema and `app.ts` installs the fastify serializer
    // compiler, so a `type` value the enum does not list fails
    // serialization and the request 500s. No unit test covers this,
    // so this request is the only thing that holds the enum to the
    // types the server can actually write (see `trip.service.cancelTrip`).
    it("should return 200 for a trip_cancelled row", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      // Inserted straight through the db: the TS union is not a runtime
      // guard here, and a `trip_update` row proves the control path.
      await db.insert(notifications).values([
        {
          userId: testUser.id,
          tripId: trip.id,
          type: "trip_cancelled" as (typeof notifications.$inferInsert)["type"],
          title: "Trip deleted",
          body: "Lisbon was deleted by an organizer",
        },
        {
          userId: testUser.id,
          tripId: trip.id,
          type: "trip_update",
          title: "Test Notification",
          body: "This is a test notification",
        },
      ]);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/notifications",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.notifications).toHaveLength(2);
      expect(body.notifications.map((n: { type: string }) => n.type).sort()).toEqual([
        "trip_cancelled",
        "trip_update",
      ]);
    });

    it("should support unreadOnly=true filter", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      // Create 2 unread and 1 read notification
      await createNotification(testUser.id, trip.id);
      await createNotification(testUser.id, trip.id);
      await createNotification(testUser.id, trip.id, {
        readAt: new Date(),
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/notifications?unreadOnly=true",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.notifications).toHaveLength(2);
      expect(body.unreadCount).toBe(2);
    });

    it("should return empty list when no notifications exist", async () => {
      app = await buildApp();

      const { testUser } = await createTestData();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/notifications",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.notifications).toHaveLength(0);
      expect(body.meta.total).toBe(0);
      expect(body.unreadCount).toBe(0);
    });

    it("should filter by tripId query parameter", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      // Create a second trip
      const [trip2] = await db
        .insert(trips)
        .values({
          name: "Trip 2",
          destination: "London",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip2.id,
        userId: testUser.id,
        status: "going",
      });

      // Notifications for trip 1
      await createNotification(testUser.id, trip.id);
      await createNotification(testUser.id, trip.id);

      // Notification for trip 2
      await createNotification(testUser.id, trip2.id);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/notifications?tripId=${trip.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.notifications).toHaveLength(2);
      expect(body.meta.total).toBe(2);
    });

    it("should return 401 when not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/notifications",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/notifications/unread-count", () => {
    it("should return correct unread count", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      // Create 2 unread and 1 read notification
      await createNotification(testUser.id, trip.id);
      await createNotification(testUser.id, trip.id);
      await createNotification(testUser.id, trip.id, {
        readAt: new Date(),
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("count", 2);
    });

    it("should return 0 when no unread notifications", async () => {
      app = await buildApp();

      const { testUser } = await createTestData();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("count", 0);
    });

    it("should return 401 when not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("PATCH /api/notifications/:notificationId/read", () => {
    it("should mark notification as read and return 200", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();
      const notification = await createNotification(testUser.id, trip.id);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/notifications/${notification.id}/read`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
    });

    it("should return 404 for non-existent notification ID", async () => {
      app = await buildApp();

      const { testUser } = await createTestData();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/notifications/550e8400-e29b-41d4-a716-446655440000/read",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(404);
    });

    it("should return 404 for another user's notification", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();
      const notification = await createNotification(testUser.id, trip.id);

      // Create another user
      const [otherUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Other User",
          timezone: "UTC",
        })
        .returning();

      const token = app.jwt.sign({
        sub: otherUser.id,
        name: otherUser.displayName,
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/notifications/${notification.id}/read`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(404);
    });

    it("should return 401 when not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "PATCH",
        url: "/api/notifications/550e8400-e29b-41d4-a716-446655440000/read",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("PATCH /api/notifications/read-all", () => {
    it("should mark all notifications as read and return 200", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      // Create multiple unread notifications
      await createNotification(testUser.id, trip.id);
      await createNotification(testUser.id, trip.id);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/notifications/read-all",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);

      // Verify they are now read
      const countResponse = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
        cookies: { auth_token: token },
      });

      const countBody = JSON.parse(countResponse.body);
      expect(countBody.count).toBe(0);
    });

    it("should support tripId body param for scoping", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      // Create a second trip
      const [trip2] = await db
        .insert(trips)
        .values({
          name: "Trip 2",
          destination: "London",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip2.id,
        userId: testUser.id,
        status: "going",
      });

      // Notifications for trip 1
      await createNotification(testUser.id, trip.id);

      // Notification for trip 2
      await createNotification(testUser.id, trip2.id);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Mark only trip 1 notifications as read
      const response = await app.inject({
        method: "PATCH",
        url: "/api/notifications/read-all",
        cookies: { auth_token: token },
        payload: { tripId: trip.id },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);

      // Verify: total unread should be 1 (trip2 notification still unread)
      const countResponse = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
        cookies: { auth_token: token },
      });

      const countBody = JSON.parse(countResponse.body);
      expect(countBody.count).toBe(1);
    });

    it("should return 401 when not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "PATCH",
        url: "/api/notifications/read-all",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/trips/:tripId/notifications", () => {
    it("should return trip-scoped notifications with 200", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      // Create notifications for this trip
      await createNotification(testUser.id, trip.id);
      await createNotification(testUser.id, trip.id);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/notifications`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("notifications");
      expect(body.notifications).toHaveLength(2);
      expect(body).toHaveProperty("meta");
      expect(body).toHaveProperty("unreadCount", 2);
    });

    it("should only return notifications for the specified trip", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      // Create a second trip
      const [trip2] = await db
        .insert(trips)
        .values({
          name: "Trip 2",
          destination: "London",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip2.id,
        userId: testUser.id,
        status: "going",
      });

      // Notifications for trip 1
      await createNotification(testUser.id, trip.id);

      // Notification for trip 2
      await createNotification(testUser.id, trip2.id);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/notifications`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.notifications).toHaveLength(1);
      expect(body.meta.total).toBe(1);
    });

    it("should return 401 when not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/notifications",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/trips/:tripId/notifications/unread-count", () => {
    it("should return trip-scoped unread count with 200", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      // Create 2 unread and 1 read notification for the trip
      await createNotification(testUser.id, trip.id);
      await createNotification(testUser.id, trip.id);
      await createNotification(testUser.id, trip.id, {
        readAt: new Date(),
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/notifications/unread-count`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("count", 2);
    });

    it("should not count notifications from other trips", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      // Create a second trip
      const [trip2] = await db
        .insert(trips)
        .values({
          name: "Trip 2",
          destination: "London",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip2.id,
        userId: testUser.id,
        status: "going",
      });

      // 1 notification for trip 1
      await createNotification(testUser.id, trip.id);

      // 2 notifications for trip 2
      await createNotification(testUser.id, trip2.id);
      await createNotification(testUser.id, trip2.id);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/notifications/unread-count`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("count", 1);
    });

    it("should return 401 when not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/notifications/unread-count",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/trips/:tripId/notification-preferences", () => {
    it("should return default preferences when none exist", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/notification-preferences`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("preferences");
      expect(body.preferences).toMatchObject({
        dailyItinerary: true,
        tripMessages: true,
      });
    });

    it("should return saved preferences", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      // Create custom preferences
      await db.insert(notificationPreferences).values({
        userId: testUser.id,
        tripId: trip.id,
        dailyItinerary: true,
        tripMessages: false,
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/notification-preferences`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.preferences).toMatchObject({
        dailyItinerary: true,
        tripMessages: false,
      });
    });

    it("should return 401 when not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/notification-preferences",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("PUT /api/trips/:tripId/notification-preferences", () => {
    it("should create preferences and return 200", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}/notification-preferences`,
        cookies: { auth_token: token },
        payload: {
          dailyItinerary: true,
          tripMessages: false,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("preferences");
      expect(body.preferences).toMatchObject({
        dailyItinerary: true,
        tripMessages: false,
      });
    });

    it("should update existing preferences and return 200", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      // Create initial preferences
      await db.insert(notificationPreferences).values({
        userId: testUser.id,
        tripId: trip.id,
        dailyItinerary: true,
        tripMessages: true,
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}/notification-preferences`,
        cookies: { auth_token: token },
        payload: {
          dailyItinerary: false,
          tripMessages: false,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.preferences).toMatchObject({
        dailyItinerary: false,
        tripMessages: false,
      });
    });

    it("should return 400 with invalid body", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}/notification-preferences`,
        cookies: { auth_token: token },
        payload: {
          dailyItinerary: "not-a-boolean",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 with missing required fields", async () => {
      app = await buildApp();

      const { testUser, trip } = await createTestData();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}/notification-preferences`,
        cookies: { auth_token: token },
        payload: {
          dailyItinerary: true,
          // missing tripMessages
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 401 when not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "PUT",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/notification-preferences",
        payload: {
          dailyItinerary: true,
          tripMessages: true,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 403 when user has no display name (incomplete profile)", async () => {
      app = await buildApp();

      const [incompleteUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "UTC",
          createdBy: incompleteUser.id,
        })
        .returning();

      const token = app.jwt.sign({
        sub: incompleteUser.id,
        name: null,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}/notification-preferences`,
        cookies: { auth_token: token },
        payload: {
          dailyItinerary: true,
          tripMessages: true,
        },
      });

      // Should be 403 (incomplete profile) since requireCompleteProfile is enforced
      expect(response.statusCode).toBe(403);
    });
  });
});
