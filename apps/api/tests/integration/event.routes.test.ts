import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips, members, events } from "@/db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";

describe("Event Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("POST /api/trips/:tripId/events", () => {
    it("should create event and return 201", async () => {
      app = await buildApp();

      // Create test user with complete profile
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add user as member
      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/events`,
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Eiffel Tower Visit",
          eventType: "activity",
          startTime: "2026-06-15T14:00:00Z",
          description: "Visit the Eiffel Tower",
          location: "Eiffel Tower, Paris",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("event");
      expect(body.event).toMatchObject({
        name: "Eiffel Tower Visit",
        eventType: "activity",
        description: "Visit the Eiffel Tower",
        location: "Eiffel Tower, Paris",
        tripId: trip.id,
        createdBy: testUser.id,
      });
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/events",
        payload: {
          name: "Test Event",
          eventType: "activity",
          startTime: "2026-06-15T14:00:00Z",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return 403 if user lacks permission", async () => {
      app = await buildApp();

      // Create trip owner
      const ownerResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Owner",
          timezone: "UTC",
        })
        .returning();

      const owner = ownerResult[0];

      // Create trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Owner's Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: owner.id,
        })
        .returning();

      const trip = tripResult[0];

      await db.insert(members).values({
        tripId: trip.id,
        userId: owner.id,
        status: "going",
      });

      // Create unauthorized user
      const unauthorizedResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Unauthorized User",
          timezone: "UTC",
        })
        .returning();

      const unauthorized = unauthorizedResult[0];

      const token = app.jwt.sign({
        sub: unauthorized.id,
        name: unauthorized.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/events`,
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Unauthorized Event",
          eventType: "activity",
          startTime: "2026-06-15T14:00:00Z",
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it("should create an event with meetup fields", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/events`,
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Group Dinner",
          eventType: "meal",
          startTime: "2026-06-15T19:00:00Z",
          meetupLocation: "Hotel lobby",
          meetupTime: "2026-06-15T18:30:00Z",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.event.meetupLocation).toBe("Hotel lobby");
      expect(body.event.meetupTime).toBeTruthy();
    });

    it("should return 400 for invalid event data", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/events`,
        cookies: {
          auth_token: token,
        },
        payload: {
          // Missing required fields
          name: "Test Event",
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /api/trips/:tripId/events", () => {
    it("should list all events for a trip", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Create trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      // Create events
      await db.insert(events).values([
        {
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Event 1",
          eventType: "activity",
          startTime: new Date("2026-06-15T14:00:00Z"),
        },
        {
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Event 2",
          eventType: "meal",
          startTime: new Date("2026-06-15T18:00:00Z"),
        },
      ]);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/events`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("events");
      expect(body.events).toHaveLength(2);
    });

    it("should filter events by type", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      await db.insert(events).values([
        {
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Activity Event",
          eventType: "activity",
          startTime: new Date("2026-06-15T14:00:00Z"),
        },
        {
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Meal Event",
          eventType: "meal",
          startTime: new Date("2026-06-15T18:00:00Z"),
        },
      ]);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/events?type=activity`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.events).toHaveLength(1);
      expect(body.events[0].eventType).toBe("activity");
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/events",
      });

      expect(response.statusCode).toBe(401);
    });

    it("includes creatorAttending field on events when creator status is going", async () => {
      app = await buildApp();

      // Create test user
      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Creator User",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      // Add user as going member
      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
        isOrganizer: true,
      });

      // Create an event
      await db.insert(events).values({
        tripId: trip.id,
        createdBy: testUser.id,
        name: "Attending Event",
        eventType: "activity",
        startTime: new Date("2026-06-15T14:00:00Z"),
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/events`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.events).toHaveLength(1);
      expect(body.events[0].creatorAttending).toBe(true);
    });

    it("creatorAttending is false when creator RSVP is not going", async () => {
      app = await buildApp();

      // Create event creator
      const [creator] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Maybe Creator",
          timezone: "UTC",
        })
        .returning();

      // Create a second user (organizer) to fetch events
      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: organizer.id,
        })
        .returning();

      // Add organizer as going member
      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      // Add creator as maybe member
      await db.insert(members).values({
        tripId: trip.id,
        userId: creator.id,
        status: "maybe",
        isOrganizer: false,
      });

      // Create an event by the creator
      await db.insert(events).values({
        tripId: trip.id,
        createdBy: creator.id,
        name: "Maybe Event",
        eventType: "meal",
        startTime: new Date("2026-06-15T18:00:00Z"),
      });

      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/events`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.events).toHaveLength(1);
      expect(body.events[0].creatorAttending).toBe(false);
    });

    it("includes creatorName and creatorProfilePhotoUrl on events", async () => {
      app = await buildApp();

      // Create test user with profile info
      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Jane Smith",
          timezone: "UTC",
          profilePhotoUrl: "https://example.com/photo.jpg",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      // Add user as going member
      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
        isOrganizer: true,
      });

      // Create an event
      await db.insert(events).values({
        tripId: trip.id,
        createdBy: testUser.id,
        name: "Profile Event",
        eventType: "activity",
        startTime: new Date("2026-06-15T14:00:00Z"),
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/events`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.events).toHaveLength(1);
      expect(body.events[0].creatorName).toBe("Jane Smith");
      expect(body.events[0].creatorProfilePhotoUrl).toBe(
        "https://example.com/photo.jpg",
      );
    });

    it("returns 403 for non-going non-organizer member", async () => {
      app = await buildApp();

      // Create organizer
      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Preview Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: organizer.id,
        })
        .returning();

      // Add organizer as going member
      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      // Create a maybe member (non-going, non-organizer)
      const [maybeUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Maybe User",
          timezone: "UTC",
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: maybeUser.id,
        status: "maybe",
        isOrganizer: false,
      });

      // Create an event
      await db.insert(events).values({
        tripId: trip.id,
        createdBy: organizer.id,
        name: "Secret Event",
        eventType: "activity",
        startTime: new Date("2026-06-15T14:00:00Z"),
      });

      const token = app.jwt.sign({
        sub: maybeUser.id,
        name: maybeUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/events`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe("PREVIEW_ACCESS_ONLY");
    });

    it("returns creatorAttending false when event creator is removed from trip", async () => {
      app = await buildApp();

      // Create trip organizer
      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      // Create event creator
      const [creator] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Removed Creator",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: organizer.id,
        })
        .returning();

      // Add organizer as going member
      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      // Add creator as going member
      await db.insert(members).values({
        tripId: trip.id,
        userId: creator.id,
        status: "going",
        isOrganizer: false,
      });

      // Create an event by the creator
      await db.insert(events).values({
        tripId: trip.id,
        createdBy: creator.id,
        name: "Creator Removed Event",
        eventType: "activity",
        startTime: new Date("2026-06-15T14:00:00Z"),
      });

      // Remove the creator's member record (simulates being removed from trip)
      await db
        .delete(members)
        .where(
          and(eq(members.tripId, trip.id), eq(members.userId, creator.id)),
        );

      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/events`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.events).toHaveLength(1);
      // Creator was removed from trip, so creatorAttending should be false
      expect(body.events[0].creatorAttending).toBe(false);
    });
  });

  describe("GET /api/events/:id", () => {
    it("should get event by ID", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const eventResult = await db
        .insert(events)
        .values({
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Test Event",
          eventType: "activity",
          startTime: new Date("2026-06-15T14:00:00Z"),
        })
        .returning();

      const event = eventResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/events/${event.id}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("event");
      expect(body.event.id).toBe(event.id);
    });

    it("should return 404 if event not found", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/events/550e8400-e29b-41d4-a716-446655440000",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PUT /api/events/:id", () => {
    it("should update event and return 200", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const eventResult = await db
        .insert(events)
        .values({
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Original Event",
          eventType: "activity",
          startTime: new Date("2026-06-15T14:00:00Z"),
        })
        .returning();

      const event = eventResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/events/${event.id}`,
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Updated Event",
          description: "Updated description",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.event.name).toBe("Updated Event");
      expect(body.event.description).toBe("Updated description");
    });

    it("should update event meetup fields", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const eventResult = await db
        .insert(events)
        .values({
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Museum Visit",
          eventType: "activity",
          startTime: new Date("2026-06-15T14:00:00Z"),
        })
        .returning();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/events/${eventResult[0].id}`,
        cookies: {
          auth_token: token,
        },
        payload: {
          meetupLocation: "Bus stop",
          meetupTime: "2026-06-15T13:30:00Z",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.event.meetupLocation).toBe("Bus stop");
      expect(body.event.meetupTime).toBeTruthy();
    });

    it("should return 403 if user lacks permission", async () => {
      app = await buildApp();

      // Create event owner
      const ownerResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Owner",
          timezone: "UTC",
        })
        .returning();

      const owner = ownerResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: owner.id,
        })
        .returning();

      const trip = tripResult[0];

      await db.insert(members).values({
        tripId: trip.id,
        userId: owner.id,
        status: "going",
      });

      const eventResult = await db
        .insert(events)
        .values({
          tripId: trip.id,
          createdBy: owner.id,
          name: "Test Event",
          eventType: "activity",
          startTime: new Date("2026-06-15T14:00:00Z"),
        })
        .returning();

      const event = eventResult[0];

      // Create unauthorized user
      const unauthorizedResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Unauthorized User",
          timezone: "UTC",
        })
        .returning();

      const unauthorized = unauthorizedResult[0];

      const token = app.jwt.sign({
        sub: unauthorized.id,
        name: unauthorized.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/events/${event.id}`,
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Unauthorized Update",
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("DELETE /api/events/:id", () => {
    it("should soft delete event and return 200", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const eventResult = await db
        .insert(events)
        .values({
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Test Event",
          eventType: "activity",
          startTime: new Date("2026-06-15T14:00:00Z"),
        })
        .returning();

      const event = eventResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/events/${event.id}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
    });
  });

  describe("POST /api/events/:id/restore", () => {
    it("should restore soft-deleted event and return 200", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      const eventResult = await db
        .insert(events)
        .values({
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Test Event",
          eventType: "activity",
          startTime: new Date("2026-06-15T14:00:00Z"),
          deletedAt: new Date(),
          deletedBy: testUser.id,
        })
        .returning();

      const event = eventResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/events/${event.id}/restore`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("event");
      expect(body.event.deletedAt).toBeNull();
    });
  });

  describe("Entity count limits", () => {
    it("should return 400 when event limit exceeded", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Limit Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Limit Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      // Bulk insert 50 events (at the limit)
      await db.insert(events).values(
        Array.from({ length: 50 }, (_, i) => ({
          tripId: trip.id,
          createdBy: testUser.id,
          name: `Event ${i + 1}`,
          eventType: "activity" as const,
          startTime: new Date(
            `2026-06-15T${String(i % 24).padStart(2, "0")}:00:00Z`,
          ),
        })),
      );

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/events`,
        cookies: { auth_token: token },
        payload: {
          name: "One Too Many",
          eventType: "activity",
          startTime: "2026-06-16T14:00:00Z",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "EVENT_LIMIT_EXCEEDED",
          message: "Maximum 50 events per trip reached.",
        },
      });
    });

    it("should allow creating event when soft-deleted events bring count below limit", async () => {
      app = await buildApp();

      const [testUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Soft Delete Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Soft Delete Test Trip",
          destination: "Paris",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      // Insert 49 active events + 1 soft-deleted event
      await db.insert(events).values(
        Array.from({ length: 49 }, (_, i) => ({
          tripId: trip.id,
          createdBy: testUser.id,
          name: `Event ${i + 1}`,
          eventType: "activity" as const,
          startTime: new Date(
            `2026-06-15T${String(i % 24).padStart(2, "0")}:00:00Z`,
          ),
        })),
      );

      // Insert 1 soft-deleted event (should not count)
      await db.insert(events).values({
        tripId: trip.id,
        createdBy: testUser.id,
        name: "Deleted Event",
        eventType: "activity" as const,
        startTime: new Date("2026-06-16T12:00:00Z"),
        deletedAt: new Date(),
        deletedBy: testUser.id,
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/events`,
        cookies: { auth_token: token },
        payload: {
          name: "Should Succeed",
          eventType: "activity",
          startTime: "2026-06-16T14:00:00Z",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.event.name).toBe("Should Succeed");
    });
  });

});
