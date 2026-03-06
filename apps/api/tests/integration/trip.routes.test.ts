import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, members, trips, events } from "@/db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";
import FormData from "form-data";

describe("POST /api/trips", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Success Cases", () => {
    it("should create trip with minimal data (name, destination, timezone) and return 201", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Summer Adventure",
          destination: "Paris, France",
          timezone: "Europe/Paris",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("trip");
      expect(body.trip).toMatchObject({
        name: "Summer Adventure",
        destination: "Paris, France",
        preferredTimezone: "Europe/Paris",
        createdBy: testUser.id,
        allowMembersToAddEvents: true,
      });
      expect(body.trip).toHaveProperty("id");
      expect(body.trip).toHaveProperty("createdAt");
      expect(body.trip).toHaveProperty("updatedAt");
    });

    it("should create trip with all optional fields and return 201", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Complete Trip",
          destination: "Tokyo, Japan",
          timezone: "Asia/Tokyo",
          startDate: "2026-06-01",
          endDate: "2026-06-10",
          description: "A comprehensive trip to Japan",
          coverImageUrl: "https://example.com/image.jpg",
          allowMembersToAddEvents: false,
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.trip).toMatchObject({
        name: "Complete Trip",
        destination: "Tokyo, Japan",
        preferredTimezone: "Asia/Tokyo",
        startDate: "2026-06-01",
        endDate: "2026-06-10",
        description: "A comprehensive trip to Japan",
        coverImageUrl: "https://example.com/image.jpg",
        allowMembersToAddEvents: false,
      });
    });

    it("should create trip with co-organizers and return 201", async () => {
      app = await buildApp();

      // Create test users
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Create co-organizers
      const coOrg1Phone = generateUniquePhone();
      const coOrg2Phone = generateUniquePhone();

      await db.insert(users).values([
        {
          phoneNumber: coOrg1Phone,
          displayName: "Co-Organizer 1",
          timezone: "UTC",
        },
        {
          phoneNumber: coOrg2Phone,
          displayName: "Co-Organizer 2",
          timezone: "UTC",
        },
      ]);

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Group Trip",
          destination: "New York, USA",
          timezone: "America/New_York",
          coOrganizerPhones: [coOrg1Phone, coOrg2Phone],
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.trip.name).toBe("Group Trip");
    });

    it("should create member record for creator with status='going' and isOrganizer=true", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Creator User",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Test Trip",
          destination: "London, UK",
          timezone: "Europe/London",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      const tripId = body.trip.id;

      // Verify member record was created for creator
      const memberRecords = await db
        .select()
        .from(members)
        .where(and(eq(members.tripId, tripId), eq(members.userId, testUser.id)))
        .limit(1);

      expect(memberRecords).toHaveLength(1);
      expect(memberRecords[0].status).toBe("going");
      expect(memberRecords[0].isOrganizer).toBe(true);
    });

    it("should create member records for co-organizers with status='going' and isOrganizer=true", async () => {
      app = await buildApp();

      // Create test users
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Create co-organizers
      const coOrg1Phone = generateUniquePhone();
      const coOrg2Phone = generateUniquePhone();

      const coOrgsResult = await db
        .insert(users)
        .values([
          {
            phoneNumber: coOrg1Phone,
            displayName: "Co-Organizer 1",
            timezone: "UTC",
          },
          {
            phoneNumber: coOrg2Phone,
            displayName: "Co-Organizer 2",
            timezone: "UTC",
          },
        ])
        .returning();

      const coOrgIds = coOrgsResult.map((u) => u.id);

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Co-Org Trip",
          destination: "Berlin, Germany",
          timezone: "Europe/Berlin",
          coOrganizerPhones: [coOrg1Phone, coOrg2Phone],
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      const tripId = body.trip.id;

      // Verify member records for co-organizers
      const coOrgMemberRecords = await db
        .select()
        .from(members)
        .where(eq(members.tripId, tripId));

      // Should have 3 members: creator + 2 co-organizers
      expect(coOrgMemberRecords).toHaveLength(3);

      // Verify co-organizers have status='going'
      const coOrgMembers = coOrgMemberRecords.filter((m) =>
        coOrgIds.includes(m.userId),
      );
      expect(coOrgMembers).toHaveLength(2);
      expect(coOrgMembers[0].status).toBe("going");
      expect(coOrgMembers[0].isOrganizer).toBe(true);
      expect(coOrgMembers[1].status).toBe("going");
      expect(coOrgMembers[1].isOrganizer).toBe(true);
    });
  });

  describe("Validation Errors (400)", () => {
    it("should return 400 when name is missing", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
        payload: {
          destination: "Paris, France",
          timezone: "Europe/Paris",
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: expect.any(Array),
        },
      });
    });

    it("should return 400 when name is too short (< 3 chars)", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "AB",
          destination: "Paris, France",
          timezone: "Europe/Paris",
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.details[0].message).toContain("at least 3 characters");
    });

    it("should return 400 when destination is missing", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Test Trip",
          timezone: "Europe/Paris",
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when timezone is missing", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Test Trip",
          destination: "Paris, France",
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when endDate is before startDate", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Test Trip",
          destination: "Paris, France",
          timezone: "Europe/Paris",
          startDate: "2026-06-10",
          endDate: "2026-06-01",
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.details[0].message).toContain(
        "End date must be on or after start date",
      );
    });
  });

  describe("Unauthorized Cases (401)", () => {
    it("should return 401 when no token provided", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        payload: {
          name: "Test Trip",
          destination: "Paris, France",
          timezone: "Europe/Paris",
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or expired token",
        },
      });
    });

    it("should return 401 when invalid token provided", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: {
          auth_token: "invalid.token.here",
        },
        payload: {
          name: "Test Trip",
          destination: "Paris, France",
          timezone: "Europe/Paris",
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Forbidden Cases (403)", () => {
    it("should return 403 when user has incomplete profile (no displayName)", async () => {
      app = await buildApp();

      // Create test user with empty displayName
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Generate JWT token (without name in token)
      const token = app.jwt.sign({
        sub: testUser.id,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Test Trip",
          destination: "Paris, France",
          timezone: "Europe/Paris",
        },
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "PROFILE_INCOMPLETE",
          message: "Profile setup required. Please complete your profile.",
        },
      });
    });
  });

  describe("Business Logic Errors", () => {
    it("should return 400 when co-organizer phone not found", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Use a phone number that doesn't exist
      const nonExistentPhone = generateUniquePhone();

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Test Trip",
          destination: "Paris, France",
          timezone: "Europe/Paris",
          coOrganizerPhones: [nonExistentPhone],
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "CO_ORGANIZER_NOT_FOUND",
          message: `Co-organizer not found: ${nonExistentPhone}`,
        },
      });
    });

    it("should return 400 when member limit exceeded", async () => {
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

      // Create 25 co-organizers (creator + 25 = 26, exceeds limit)
      const coOrgPhones: string[] = [];
      const coOrgValues = [];

      for (let i = 0; i < 25; i++) {
        const phone = generateUniquePhone();
        coOrgPhones.push(phone);
        coOrgValues.push({
          phoneNumber: phone,
          displayName: `Co-Org ${i}`,
          timezone: "UTC",
        });
      }

      await db.insert(users).values(coOrgValues);

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Test Trip",
          destination: "Paris, France",
          timezone: "Europe/Paris",
          coOrganizerPhones: coOrgPhones,
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "MEMBER_LIMIT_EXCEEDED",
          message:
            "Member limit exceeded: maximum 25 members allowed (including creator)",
        },
      });
    });
  });
});

describe("GET /api/trips", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Success Cases", () => {
    it("should return 200 with empty array when user has no trips", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.meta).toEqual({
        total: 0,
        limit: 20,
        hasMore: false,
        nextCursor: null,
      });
    });

    it("should return 200 with trips array when user has trips", async () => {
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

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Summer Adventure",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          startDate: "2026-06-01",
          endDate: "2026-06-10",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add user as member (organizer)
      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: trip.id,
        name: "Summer Adventure",
        destination: "Paris, France",
        startDate: "2026-06-01",
        endDate: "2026-06-10",
        isOrganizer: true,
        rsvpStatus: "going",
        memberCount: 1,
        eventCount: 0,
      });
      expect(body.data[0]).toHaveProperty("coverImageUrl");
      expect(body.data[0]).toHaveProperty("organizerInfo");
      expect(Array.isArray(body.data[0].organizerInfo)).toBe(true);
      expect(body.meta).toBeDefined();
      expect(body.meta.total).toBe(1);
    });

    it("should return 200 with multiple trips ordered by startDate", async () => {
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

      // Create trips with different start dates
      const trip1Result = await db
        .insert(trips)
        .values({
          name: "Trip 1 - Later",
          destination: "Tokyo, Japan",
          preferredTimezone: "Asia/Tokyo",
          startDate: "2026-08-01",
          createdBy: testUser.id,
        })
        .returning();

      const trip2Result = await db
        .insert(trips)
        .values({
          name: "Trip 2 - Earlier",
          destination: "London, UK",
          preferredTimezone: "Europe/London",
          startDate: "2026-06-01",
          createdBy: testUser.id,
        })
        .returning();

      // Add user as member to both trips (as organizer)
      await db.insert(members).values([
        {
          tripId: trip1Result[0].id,
          userId: testUser.id,
          status: "going",
          isOrganizer: true,
        },
        {
          tripId: trip2Result[0].id,
          userId: testUser.id,
          status: "going",
          isOrganizer: true,
        },
      ]);

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      // Should be ordered by startDate, so earlier trip first
      expect(body.data[0].name).toBe("Trip 2 - Earlier");
      expect(body.data[1].name).toBe("Trip 1 - Later");
      expect(body.meta.total).toBe(2);
    });

    it("should not return cancelled trips", async () => {
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

      // Create active trip
      const activeTripResult = await db
        .insert(trips)
        .values({
          name: "Active Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
          cancelled: false,
        })
        .returning();

      // Create cancelled trip
      const cancelledTripResult = await db
        .insert(trips)
        .values({
          name: "Cancelled Trip",
          destination: "Berlin, Germany",
          preferredTimezone: "Europe/Berlin",
          createdBy: testUser.id,
          cancelled: true,
        })
        .returning();

      // Add user as member to both trips (as organizer)
      await db.insert(members).values([
        {
          tripId: activeTripResult[0].id,
          userId: testUser.id,
          status: "going",
          isOrganizer: true,
        },
        {
          tripId: cancelledTripResult[0].id,
          userId: testUser.id,
          status: "going",
          isOrganizer: true,
        },
      ]);

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("Active Trip");
      expect(body.meta.total).toBe(1);
    });

    it("should return correct eventCount with real events", async () => {
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

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Event Count Trip",
          destination: "Tokyo, Japan",
          preferredTimezone: "Asia/Tokyo",
          startDate: "2026-06-01",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add user as member (organizer)
      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
        isOrganizer: true,
      });

      // Add active events
      await db.insert(events).values([
        {
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Active Event 1",
          eventType: "activity",
          startTime: new Date("2026-06-01T10:00:00Z"),
        },
        {
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Active Event 2",
          eventType: "meal",
          startTime: new Date("2026-06-01T12:00:00Z"),
        },
      ]);

      // Add a soft-deleted event (should not be counted)
      await db.insert(events).values({
        tripId: trip.id,
        createdBy: testUser.id,
        name: "Deleted Event",
        eventType: "travel",
        startTime: new Date("2026-06-01T14:00:00Z"),
        deletedAt: new Date("2026-06-02T00:00:00Z"),
        deletedBy: testUser.id,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/trips",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].eventCount).toBe(2);
    });
  });

  describe("Unauthorized Cases (401)", () => {
    it("should return 401 when no token provided", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/trips",
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or expired token",
        },
      });
    });

    it("should return 401 when invalid token provided", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/trips",
        cookies: {
          auth_token: "invalid.token.here",
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });
});

describe("GET /api/trips/:id", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  describe("Success Cases", () => {
    it("should return 200 with trip details when user is member", async () => {
      app = await buildApp();

      // Create test user
      const phone = generateUniquePhone();
      const [user] = await db
        .insert(users)
        .values({
          phoneNumber: phone,
          displayName: "Test Member",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          description: "A test trip",
          startDate: "2026-06-01",
          endDate: "2026-06-07",
          createdBy: user.id,
        })
        .returning();

      // Add user as member (organizer)
      await db.insert(members).values({
        tripId: trip.id,
        userId: user.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: user.id,
      });

      // Make request
      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.trip).toBeDefined();
      expect(body.trip.id).toBe(trip.id);
      expect(body.trip.name).toBe("Test Trip");
      expect(body.trip.destination).toBe("Paris, France");
      expect(body.trip.description).toBe("A test trip");
      expect(body.trip.createdBy).toBe(user.id);
      expect(body.trip.organizers).toBeDefined();
      expect(Array.isArray(body.trip.organizers)).toBe(true);
      expect(body.trip.memberCount).toBeDefined();
      expect(typeof body.trip.memberCount).toBe("number");
      expect(body.trip.memberCount).toBe(1);
    });
  });

  describe("Error Cases", () => {
    it("should return 400 for invalid UUID format", async () => {
      app = await buildApp();

      // Create test user
      const phone = generateUniquePhone();
      const [user] = await db
        .insert(users)
        .values({
          phoneNumber: phone,
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      // Generate JWT token
      const token = app.jwt.sign({
        sub: user.id,
      });

      // Make request with invalid UUID
      const response = await app.inject({
        method: "GET",
        url: "/api/trips/not-a-valid-uuid",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Invalid request data");
    });

    it("should return 404 when trip does not exist", async () => {
      app = await buildApp();

      // Create test user
      const phone = generateUniquePhone();
      const [user] = await db
        .insert(users)
        .values({
          phoneNumber: phone,
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      // Generate JWT token
      const token = app.jwt.sign({
        sub: user.id,
      });

      // Make request with non-existent trip ID (valid UUID format)
      const nonExistentId = "550e8400-e29b-41d4-a716-446655440000";
      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${nonExistentId}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Trip not found");
    });

    it("should return 404 when user is not a member of the trip", async () => {
      app = await buildApp();

      // Create trip organizer
      const organizerPhone = generateUniquePhone();
      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: organizerPhone,
          displayName: "Trip Organizer",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Private Trip",
          destination: "Tokyo, Japan",
          preferredTimezone: "Asia/Tokyo",
          description: "Only for members",
          startDate: "2026-07-01",
          endDate: "2026-07-07",
          createdBy: organizer.id,
        })
        .returning();

      // Add organizer as member
      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      // Create different user (not a member)
      const nonMemberPhone = generateUniquePhone();
      const [nonMember] = await db
        .insert(users)
        .values({
          phoneNumber: nonMemberPhone,
          displayName: "Non Member",
          timezone: "UTC",
        })
        .returning();

      // Generate JWT token for non-member
      const token = app.jwt.sign({
        sub: nonMember.id,
      });

      // Make request
      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Trip not found");
    });

    it("should return 401 when no auth token is provided", async () => {
      app = await buildApp();

      // Create a trip (doesn't matter if it exists)
      const phone = generateUniquePhone();
      const [user] = await db
        .insert(users)
        .values({
          phoneNumber: phone,
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Berlin, Germany",
          preferredTimezone: "Europe/Berlin",
          description: "A test trip",
          startDate: "2026-08-01",
          endDate: "2026-08-07",
          createdBy: user.id,
        })
        .returning();

      // Make request without auth token
      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}`,
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("should return 401 with invalid auth token", async () => {
      app = await buildApp();

      // Create a trip
      const phone = generateUniquePhone();
      const [user] = await db
        .insert(users)
        .values({
          phoneNumber: phone,
          displayName: "Test User",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Berlin, Germany",
          preferredTimezone: "Europe/Berlin",
          description: "A test trip",
          startDate: "2026-08-01",
          endDate: "2026-08-07",
          createdBy: user.id,
        })
        .returning();

      // Make request with invalid token
      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: "invalid.token.here",
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Preview and Membership Info", () => {
    it("returns 404 for uninvited user", async () => {
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
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: organizer.id,
        })
        .returning();

      // Add organizer as member
      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      // Create uninvited user (no member record)
      const [uninvitedUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Uninvited User",
          timezone: "UTC",
        })
        .returning();

      const token = app.jwt.sign({
        sub: uninvitedUser.id,
        name: uninvitedUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("returns preview for invited non-Going member with no_response status", async () => {
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
          destination: "Tokyo, Japan",
          preferredTimezone: "Asia/Tokyo",
          createdBy: organizer.id,
        })
        .returning();

      // Add organizer as member
      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      // Create invited user with no_response status
      const [invitedUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Invited User",
          timezone: "UTC",
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: invitedUser.id,
        status: "no_response",
        isOrganizer: false,
      });

      const token = app.jwt.sign({
        sub: invitedUser.id,
        name: invitedUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.isPreview).toBe(true);
      expect(body.trip).toBeDefined();
      expect(body.trip.name).toBe("Preview Trip");
      expect(body.userRsvpStatus).toBe("no_response");

      // Verify restricted fields are absent in preview mode
      expect(body.trip).not.toHaveProperty("createdBy");
      expect(body.trip).not.toHaveProperty("allowMembersToAddEvents");
      expect(body.trip).not.toHaveProperty("cancelled");
      expect(body.trip).not.toHaveProperty("createdAt");
      expect(body.trip).not.toHaveProperty("updatedAt");

      // Verify allowed preview fields ARE present
      expect(body.trip).toHaveProperty("id");
      expect(body.trip).toHaveProperty("name");
      expect(body.trip).toHaveProperty("destination");
      expect(body.trip).toHaveProperty("startDate");
      expect(body.trip).toHaveProperty("endDate");
      expect(body.trip).toHaveProperty("preferredTimezone");
      expect(body.trip).toHaveProperty("description");
      expect(body.trip).toHaveProperty("coverImageUrl");
    });

    it("returns preview for member with maybe status", async () => {
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
          name: "Maybe Trip",
          destination: "Berlin, Germany",
          preferredTimezone: "Europe/Berlin",
          createdBy: organizer.id,
        })
        .returning();

      // Add organizer as member
      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      // Create user with maybe status
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

      const token = app.jwt.sign({
        sub: maybeUser.id,
        name: maybeUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.isPreview).toBe(true);
      expect(body.userRsvpStatus).toBe("maybe");

      // Verify restricted fields are absent in preview mode
      expect(body.trip).not.toHaveProperty("createdBy");
      expect(body.trip).not.toHaveProperty("allowMembersToAddEvents");
      expect(body.trip).not.toHaveProperty("cancelled");
      expect(body.trip).not.toHaveProperty("createdAt");
      expect(body.trip).not.toHaveProperty("updatedAt");

      // Verify allowed preview fields ARE present
      expect(body.trip).toHaveProperty("id");
      expect(body.trip).toHaveProperty("name");
      expect(body.trip).toHaveProperty("destination");
      expect(body.trip).toHaveProperty("startDate");
      expect(body.trip).toHaveProperty("endDate");
    });

    it("returns preview for member with not_going status", async () => {
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
          name: "Not Going Trip",
          destination: "Sydney, Australia",
          preferredTimezone: "Australia/Sydney",
          createdBy: organizer.id,
        })
        .returning();

      // Add organizer as member
      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      // Create user with not_going status
      const [notGoingUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Not Going User",
          timezone: "UTC",
        })
        .returning();

      await db.insert(members).values({
        tripId: trip.id,
        userId: notGoingUser.id,
        status: "not_going",
        isOrganizer: false,
      });

      const token = app.jwt.sign({
        sub: notGoingUser.id,
        name: notGoingUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.isPreview).toBe(true);
      expect(body.userRsvpStatus).toBe("not_going");

      // Verify restricted fields are absent in preview mode
      expect(body.trip).not.toHaveProperty("createdBy");
      expect(body.trip).not.toHaveProperty("allowMembersToAddEvents");
      expect(body.trip).not.toHaveProperty("cancelled");
      expect(body.trip).not.toHaveProperty("createdAt");
      expect(body.trip).not.toHaveProperty("updatedAt");

      // Verify allowed preview fields ARE present
      expect(body.trip).toHaveProperty("id");
      expect(body.trip).toHaveProperty("name");
      expect(body.trip).toHaveProperty("destination");
      expect(body.trip).toHaveProperty("startDate");
      expect(body.trip).toHaveProperty("endDate");
    });

    it("returns full data for Going member", async () => {
      app = await buildApp();

      // Create user
      const [user] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Going User",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Full Data Trip",
          destination: "London, UK",
          preferredTimezone: "Europe/London",
          createdBy: user.id,
        })
        .returning();

      // Add as going member (not organizer)
      await db.insert(members).values({
        tripId: trip.id,
        userId: user.id,
        status: "going",
        isOrganizer: false,
      });

      const token = app.jwt.sign({
        sub: user.id,
        name: user.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.isPreview).toBe(false);
      expect(body.userRsvpStatus).toBe("going");
      expect(body.isOrganizer).toBe(false);
    });

    it("returns full data for organizer regardless of RSVP status", async () => {
      app = await buildApp();

      // Create user
      const [user] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer No Response",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Organizer Trip",
          destination: "Rome, Italy",
          preferredTimezone: "Europe/Rome",
          createdBy: user.id,
        })
        .returning();

      // Add as organizer with no_response status
      await db.insert(members).values({
        tripId: trip.id,
        userId: user.id,
        status: "no_response",
        isOrganizer: true,
      });

      const token = app.jwt.sign({
        sub: user.id,
        name: user.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.isPreview).toBe(false);
      expect(body.isOrganizer).toBe(true);
      expect(body.userRsvpStatus).toBe("no_response");
    });

    it("includes userRsvpStatus and isOrganizer in response", async () => {
      app = await buildApp();

      // Create user
      const [user] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Status User",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Status Trip",
          destination: "Barcelona, Spain",
          preferredTimezone: "Europe/Madrid",
          createdBy: user.id,
        })
        .returning();

      // Add as going organizer
      await db.insert(members).values({
        tripId: trip.id,
        userId: user.id,
        status: "going",
        isOrganizer: true,
      });

      const token = app.jwt.sign({
        sub: user.id,
        name: user.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("userRsvpStatus");
      expect(body).toHaveProperty("isOrganizer");
      expect(body).toHaveProperty("isPreview");
      expect(["going", "not_going", "maybe", "no_response"]).toContain(
        body.userRsvpStatus,
      );
      expect(typeof body.isOrganizer).toBe("boolean");
      expect(typeof body.isPreview).toBe("boolean");
    });
  });
});

describe("PUT /api/trips/:id", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Success Cases", () => {
    it("should return 200 and updated trip when organizer updates trip", async () => {
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

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Original Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add creator as organizer in members
      await db.insert(members).values({
        userId: testUser.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const updateData = {
        name: "Updated Trip Name",
        destination: "Tokyo, Japan",
        timezone: "Asia/Tokyo",
        description: "An amazing trip to Japan",
        startDate: "2026-06-01",
        endDate: "2026-06-10",
      };

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: token,
        },
        payload: updateData,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.trip).toMatchObject({
        id: trip.id,
        name: "Updated Trip Name",
        destination: "Tokyo, Japan",
        preferredTimezone: "Asia/Tokyo",
        description: "An amazing trip to Japan",
        startDate: "2026-06-01",
        endDate: "2026-06-10",
      });
      expect(body.trip.updatedAt).not.toBe(trip.updatedAt.toISOString());
    });

    it("should return 200 and updated trip when co-organizer updates trip", async () => {
      app = await buildApp();

      // Create creator user
      const creatorResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const creator = creatorResult[0];

      // Create co-organizer user
      const coOrgResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Co-Organizer",
          timezone: "UTC",
        })
        .returning();

      const coOrg = coOrgResult[0];

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Original Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: creator.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add creator and co-organizer to members
      await db.insert(members).values([
        {
          userId: creator.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
        {
          userId: coOrg.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
      ]);

      // Generate JWT token for co-organizer
      const token = app.jwt.sign({
        sub: coOrg.id,
        name: coOrg.displayName,
      });

      const updateData = {
        name: "Updated by Co-Org",
      };

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: token,
        },
        payload: updateData,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.trip.name).toBe("Updated by Co-Org");
    });

    it("should allow partial updates (only some fields)", async () => {
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

      // Create a trip with full data
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Original Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          description: "Original description",
          startDate: "2026-05-01",
          endDate: "2026-05-10",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add creator as organizer in members
      await db.insert(members).values({
        userId: testUser.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Update only the name
      const updateData = {
        name: "Only Name Changed",
      };

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: token,
        },
        payload: updateData,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.trip).toMatchObject({
        id: trip.id,
        name: "Only Name Changed",
        destination: "Paris, France",
        preferredTimezone: "Europe/Paris",
        description: "Original description",
        startDate: "2026-05-01",
        endDate: "2026-05-10",
      });
    });

    it("should update updatedAt timestamp", async () => {
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

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Original Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];
      const originalUpdatedAt = trip.updatedAt;

      // Add creator as organizer in members
      await db.insert(members).values({
        userId: testUser.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: token,
        },
        payload: { name: "Updated" },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(new Date(body.trip.updatedAt).getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime(),
      );
    });
  });

  describe("Validation Errors (400)", () => {
    it("should return 400 for invalid trip ID format", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: "/api/trips/invalid-uuid",
        cookies: {
          auth_token: token,
        },
        payload: { name: "Updated" },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Invalid request data");
    });

    it("should return 400 for invalid request data", async () => {
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

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add creator as organizer in members
      await db.insert(members).values({
        userId: testUser.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: token,
        },
        payload: {
          name: 123, // Invalid - should be string
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Invalid request data");
      expect(body.error.details).toBeDefined();
    });

    it("should return 400 when endDate is before startDate", async () => {
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

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add creator as organizer in members
      await db.insert(members).values({
        userId: testUser.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: token,
        },
        payload: {
          startDate: "2026-06-10",
          endDate: "2026-06-01",
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Unauthorized Cases (401)", () => {
    it("should return 401 when no auth token provided", async () => {
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

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}`,
        payload: { name: "Updated" },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Forbidden Cases (403)", () => {
    it("should return 403 when non-organizer tries to update trip", async () => {
      app = await buildApp();

      // Create creator user
      const creatorResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const creator = creatorResult[0];

      // Create another user (not part of the trip)
      const otherUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Other User",
          timezone: "UTC",
        })
        .returning();

      const otherUser = otherUserResult[0];

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: creator.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add creator as organizer in members
      await db.insert(members).values({
        userId: creator.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token for the other user
      const token = app.jwt.sign({
        sub: otherUser.id,
        name: otherUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: token,
        },
        payload: { name: "Trying to Update" },
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
      expect(body.error.message).toBe(
        "Permission denied: only organizers can update trips",
      );
    });

    it("should return 403 when regular member tries to update trip", async () => {
      app = await buildApp();

      // Create creator user
      const creatorResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const creator = creatorResult[0];

      // Create member user
      const memberResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Member",
          timezone: "UTC",
        })
        .returning();

      const member = memberResult[0];

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: creator.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add creator as organizer and other user as regular member
      await db.insert(members).values([
        {
          userId: creator.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
        {
          userId: member.id,
          tripId: trip.id,
          status: "no_response",
        },
      ]);

      // Generate JWT token for the member
      const token = app.jwt.sign({
        sub: member.id,
        name: member.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: token,
        },
        payload: { name: "Trying to Update" },
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
    });
  });

  describe("Not Found Cases (404)", () => {
    it("should return 404 when trip does not exist", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Use a valid UUID that doesn't exist
      const nonExistentId = "550e8400-e29b-41d4-a716-446655440000";

      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${nonExistentId}`,
        cookies: {
          auth_token: token,
        },
        payload: { name: "Updated" },
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Trip not found");
    });
  });
});

describe("DELETE /trips/:id", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Success Cases", () => {
    it("should allow organizer to delete trip and soft-delete it", async () => {
      app = await buildApp();

      // Create test user (organizer)
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      const testUser = testUserResult[0];

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add creator as organizer in members
      await db.insert(members).values({
        userId: testUser.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // Verify trip is soft-deleted in database
      const [updatedTrip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, trip.id));

      expect(updatedTrip.cancelled).toBe(true);
      expect(updatedTrip.updatedAt).toBeDefined();
    });

    it("should allow co-organizer to delete trip", async () => {
      app = await buildApp();

      // Create creator user
      const creatorResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const creator = creatorResult[0];

      // Create co-organizer user
      const coOrgResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Co-Organizer",
          timezone: "UTC",
        })
        .returning();

      const coOrg = coOrgResult[0];

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Tokyo, Japan",
          preferredTimezone: "Asia/Tokyo",
          createdBy: creator.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add creator and co-organizer to members
      // Note: co-organizers are members with isOrganizer=true
      await db.insert(members).values([
        {
          userId: creator.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
        {
          userId: coOrg.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
      ]);

      // Generate JWT token for co-organizer
      const token = app.jwt.sign({
        sub: coOrg.id,
        name: coOrg.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // Verify trip is soft-deleted in database
      const [updatedTrip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, trip.id));

      expect(updatedTrip.cancelled).toBe(true);
    });
  });

  describe("Validation Errors (400)", () => {
    it("should return 400 for invalid UUID format", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/api/trips/invalid-uuid",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Invalid request data");
    });
  });

  describe("Unauthorized Cases (401)", () => {
    it("should return 401 when no auth token provided", async () => {
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

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}`,
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("should return 401 with invalid auth token", async () => {
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

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: "invalid-token",
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Forbidden Cases (403)", () => {
    it("should return 403 when non-organizer tries to delete trip", async () => {
      app = await buildApp();

      // Create creator user
      const creatorResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const creator = creatorResult[0];

      // Create another user (not part of the trip)
      const otherUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Other User",
          timezone: "UTC",
        })
        .returning();

      const otherUser = otherUserResult[0];

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: creator.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add creator as organizer in members
      await db.insert(members).values({
        userId: creator.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token for the other user
      const token = app.jwt.sign({
        sub: otherUser.id,
        name: otherUser.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
      expect(body.error.message).toBe(
        "Permission denied: only organizers can cancel trips",
      );
    });

    it("should return 403 when regular member tries to delete trip", async () => {
      app = await buildApp();

      // Create creator user
      const creatorResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const creator = creatorResult[0];

      // Create regular member user
      const memberResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Regular Member",
          timezone: "UTC",
        })
        .returning();

      const member = memberResult[0];

      // Create a trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: creator.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add creator as organizer and regular member with no_response status
      // Note: only members with isOrganizer=true are considered co-organizers
      await db.insert(members).values([
        {
          userId: creator.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
        {
          userId: member.id,
          tripId: trip.id,
          status: "no_response",
        },
      ]);

      // Generate JWT token for regular member
      const token = app.jwt.sign({
        sub: member.id,
        name: member.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
      expect(body.error.message).toBe(
        "Permission denied: only organizers can cancel trips",
      );
    });
  });

  describe("Not Found Cases (404)", () => {
    it("should return 404 when trip does not exist", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Use a valid UUID that doesn't exist
      const nonExistentId = "550e8400-e29b-41d4-a716-446655440000";

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${nonExistentId}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Trip not found");
    });
  });
});

describe("POST /api/trips/:id/co-organizers", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Success Cases", () => {
    it("should return 200 when organizer adds co-organizer by phone", async () => {
      app = await buildApp();

      // Create test users
      const creatorPhone = generateUniquePhone();
      const coOrgPhone = generateUniquePhone();

      const [creator, coOrg] = await db
        .insert(users)
        .values([
          {
            phoneNumber: creatorPhone,
            displayName: "Creator",
            timezone: "UTC",
          },
          { phoneNumber: coOrgPhone, displayName: "Co-Org", timezone: "UTC" },
        ])
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Test",
          preferredTimezone: "UTC",
          createdBy: creator.id,
        })
        .returning();

      // Add creator as organizer
      await db.insert(members).values({
        userId: creator.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate token for creator
      const token = app.jwt.sign({
        sub: creator.id,
        name: creator.displayName,
      });

      // Add co-organizer via API
      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/co-organizers`,
        cookies: { auth_token: token },
        payload: { phoneNumber: coOrgPhone },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // Verify co-organizer was added to members table
      const memberRecords = await db
        .select()
        .from(members)
        .where(and(eq(members.tripId, trip.id), eq(members.userId, coOrg.id)));

      expect(memberRecords.length).toBe(1);
      expect(memberRecords[0].status).toBe("going");
      expect(memberRecords[0].isOrganizer).toBe(true);
    });

    it("should return 200 when co-organizer can add another co-organizer", async () => {
      app = await buildApp();

      // Create test users
      const creatorPhone = generateUniquePhone();
      const coOrg1Phone = generateUniquePhone();
      const coOrg2Phone = generateUniquePhone();

      const [creator, coOrg1, coOrg2] = await db
        .insert(users)
        .values([
          {
            phoneNumber: creatorPhone,
            displayName: "Creator",
            timezone: "UTC",
          },
          {
            phoneNumber: coOrg1Phone,
            displayName: "Co-Org 1",
            timezone: "UTC",
          },
          {
            phoneNumber: coOrg2Phone,
            displayName: "Co-Org 2",
            timezone: "UTC",
          },
        ])
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Test",
          preferredTimezone: "UTC",
          createdBy: creator.id,
        })
        .returning();

      // Add creator and first co-organizer as members
      await db.insert(members).values([
        {
          userId: creator.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
        {
          userId: coOrg1.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
      ]);

      // Generate token for first co-organizer
      const token = app.jwt.sign({
        sub: coOrg1.id,
        name: coOrg1.displayName,
      });

      // Add second co-organizer via API
      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/co-organizers`,
        cookies: { auth_token: token },
        payload: { phoneNumber: coOrg2Phone },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // Verify second co-organizer was added
      const memberRecords = await db
        .select()
        .from(members)
        .where(and(eq(members.tripId, trip.id), eq(members.userId, coOrg2.id)));

      expect(memberRecords.length).toBe(1);
      expect(memberRecords[0].status).toBe("going");
      expect(memberRecords[0].isOrganizer).toBe(true);
    });
  });

  describe("Validation Errors (400)", () => {
    it("should return 400 for invalid trip ID format", async () => {
      app = await buildApp();

      // Create test user
      const creatorPhone = generateUniquePhone();
      const [creator] = await db
        .insert(users)
        .values({
          phoneNumber: creatorPhone,
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const token = app.jwt.sign({
        sub: creator.id,
        name: creator.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips/invalid-uuid/co-organizers",
        cookies: { auth_token: token },
        payload: { phoneNumber: "+12345678901" },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Invalid request data");
    });

    it("should return 400 for invalid phone format", async () => {
      app = await buildApp();

      // Create test user and trip
      const creatorPhone = generateUniquePhone();
      const [creator] = await db
        .insert(users)
        .values({
          phoneNumber: creatorPhone,
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Test",
          preferredTimezone: "UTC",
          createdBy: creator.id,
        })
        .returning();

      await db.insert(members).values({
        userId: creator.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      const token = app.jwt.sign({
        sub: creator.id,
        name: creator.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/co-organizers`,
        cookies: { auth_token: token },
        payload: { phoneNumber: "invalid-phone" },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Invalid request data");
    });

    it("should return 400 when phone number not found", async () => {
      app = await buildApp();

      // Create test user and trip
      const creatorPhone = generateUniquePhone();
      const [creator] = await db
        .insert(users)
        .values({
          phoneNumber: creatorPhone,
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Test",
          preferredTimezone: "UTC",
          createdBy: creator.id,
        })
        .returning();

      await db.insert(members).values({
        userId: creator.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      const token = app.jwt.sign({
        sub: creator.id,
        name: creator.displayName,
      });

      // Try to add non-existent phone number
      const nonExistentPhone = generateUniquePhone();
      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/co-organizers`,
        cookies: { auth_token: token },
        payload: { phoneNumber: nonExistentPhone },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("CO_ORGANIZER_NOT_FOUND");
      expect(body.error.message).toContain("Co-organizer not found:");
    });
  });

  describe("Unauthorized Cases (401)", () => {
    it("should return 401 when no auth token provided", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/trips/00000000-0000-0000-0000-000000000000/co-organizers",
        payload: { phoneNumber: "+12345678901" },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Forbidden Cases (403)", () => {
    it("should return 403 when non-organizer tries to add co-organizer", async () => {
      app = await buildApp();

      // Create test users
      const creatorPhone = generateUniquePhone();
      const nonMemberPhone = generateUniquePhone();
      const coOrgPhone = generateUniquePhone();

      const [creator, nonMember] = await db
        .insert(users)
        .values([
          {
            phoneNumber: creatorPhone,
            displayName: "Creator",
            timezone: "UTC",
          },
          {
            phoneNumber: nonMemberPhone,
            displayName: "Non-Member",
            timezone: "UTC",
          },
        ])
        .returning();

      // Create co-org user separately (only phone needed for test)
      await db.insert(users).values({
        phoneNumber: coOrgPhone,
        displayName: "Co-Org",
        timezone: "UTC",
      });

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Test",
          preferredTimezone: "UTC",
          createdBy: creator.id,
        })
        .returning();

      // Only add creator as member (organizer)
      await db.insert(members).values({
        userId: creator.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate token for non-member
      const token = app.jwt.sign({
        sub: nonMember.id,
        name: nonMember.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/co-organizers`,
        cookies: { auth_token: token },
        payload: { phoneNumber: coOrgPhone },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
      expect(body.error.message).toContain("Permission denied:");
    });
  });

  describe("Not Found Cases (404)", () => {
    it("should return 404 when trip does not exist", async () => {
      app = await buildApp();

      // Create test user
      const creatorPhone = generateUniquePhone();
      const [creator] = await db
        .insert(users)
        .values({
          phoneNumber: creatorPhone,
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const token = app.jwt.sign({
        sub: creator.id,
        name: creator.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips/00000000-0000-0000-0000-000000000000/co-organizers",
        cookies: { auth_token: token },
        payload: { phoneNumber: "+12345678901" },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Trip not found");
    });
  });

  describe("Business Logic Errors", () => {
    it("should return 400 when member limit exceeded", async () => {
      app = await buildApp();

      // Create creator
      const creatorPhone = generateUniquePhone();
      const [creator] = await db
        .insert(users)
        .values({
          phoneNumber: creatorPhone,
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Test",
          preferredTimezone: "UTC",
          createdBy: creator.id,
        })
        .returning();

      // Add creator as member (organizer)
      await db.insert(members).values({
        userId: creator.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Create and add 24 more members (total 25 including creator)
      const memberPhones = Array.from({ length: 24 }, () =>
        generateUniquePhone(),
      );
      const memberUsers = await db
        .insert(users)
        .values(
          memberPhones.map((phone, i) => ({
            phoneNumber: phone,
            displayName: `Member ${i + 1}`,
            timezone: "UTC",
          })),
        )
        .returning();

      await db.insert(members).values(
        memberUsers.map((user) => ({
          userId: user.id,
          tripId: trip.id,
          status: "going" as const,
        })),
      );

      // Create one more user to exceed limit
      const extraPhone = generateUniquePhone();
      await db
        .insert(users)
        .values({
          phoneNumber: extraPhone,
          displayName: "Extra Member",
          timezone: "UTC",
        })
        .returning();

      const token = app.jwt.sign({
        sub: creator.id,
        name: creator.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/co-organizers`,
        cookies: { auth_token: token },
        payload: { phoneNumber: extraPhone },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("MEMBER_LIMIT_EXCEEDED");
      expect(body.error.message).toContain("Member limit exceeded:");
    });
  });
});

describe("DELETE /api/trips/:id/co-organizers/:userId", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Success Cases", () => {
    it("should return 200 when organizer removes co-organizer", async () => {
      app = await buildApp();

      // Create test users
      const creatorPhone = generateUniquePhone();
      const coOrgPhone = generateUniquePhone();

      const [creator, coOrg] = await db
        .insert(users)
        .values([
          {
            phoneNumber: creatorPhone,
            displayName: "Creator",
            timezone: "UTC",
          },
          { phoneNumber: coOrgPhone, displayName: "Co-Org", timezone: "UTC" },
        ])
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Test",
          preferredTimezone: "UTC",
          createdBy: creator.id,
        })
        .returning();

      // Add both as members (organizers)
      await db.insert(members).values([
        {
          userId: creator.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
        {
          userId: coOrg.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
      ]);

      // Generate token for creator
      const token = app.jwt.sign({
        sub: creator.id,
        name: creator.displayName,
      });

      // Remove co-organizer via API
      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/co-organizers/${coOrg.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // Verify co-organizer was removed
      const memberRecords = await db
        .select()
        .from(members)
        .where(and(eq(members.tripId, trip.id), eq(members.userId, coOrg.id)));

      expect(memberRecords.length).toBe(0);
    });

    it("should return 200 when co-organizer can remove another co-organizer", async () => {
      app = await buildApp();

      // Create test users
      const creatorPhone = generateUniquePhone();
      const coOrg1Phone = generateUniquePhone();
      const coOrg2Phone = generateUniquePhone();

      const [creator, coOrg1, coOrg2] = await db
        .insert(users)
        .values([
          {
            phoneNumber: creatorPhone,
            displayName: "Creator",
            timezone: "UTC",
          },
          {
            phoneNumber: coOrg1Phone,
            displayName: "Co-Org 1",
            timezone: "UTC",
          },
          {
            phoneNumber: coOrg2Phone,
            displayName: "Co-Org 2",
            timezone: "UTC",
          },
        ])
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Test",
          preferredTimezone: "UTC",
          createdBy: creator.id,
        })
        .returning();

      // Add all as members
      await db.insert(members).values([
        {
          userId: creator.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
        {
          userId: coOrg1.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
        {
          userId: coOrg2.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
      ]);

      // Generate token for first co-organizer
      const token = app.jwt.sign({
        sub: coOrg1.id,
        name: coOrg1.displayName,
      });

      // Remove second co-organizer via API
      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/co-organizers/${coOrg2.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // Verify second co-organizer was removed
      const memberRecords = await db
        .select()
        .from(members)
        .where(and(eq(members.tripId, trip.id), eq(members.userId, coOrg2.id)));

      expect(memberRecords.length).toBe(0);
    });
  });

  describe("Validation Errors (400)", () => {
    it("should return 400 for invalid trip ID format", async () => {
      app = await buildApp();

      // Create test user
      const creatorPhone = generateUniquePhone();
      const [creator] = await db
        .insert(users)
        .values({
          phoneNumber: creatorPhone,
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const token = app.jwt.sign({
        sub: creator.id,
        name: creator.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/api/trips/invalid-uuid/co-organizers/00000000-0000-0000-0000-000000000000",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Invalid request data");
    });

    it("should return 400 for invalid user ID format", async () => {
      app = await buildApp();

      // Create test user
      const creatorPhone = generateUniquePhone();
      const [creator] = await db
        .insert(users)
        .values({
          phoneNumber: creatorPhone,
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const token = app.jwt.sign({
        sub: creator.id,
        name: creator.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/api/trips/00000000-0000-0000-0000-000000000000/co-organizers/invalid-uuid",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Invalid request data");
    });

    it("should return 400 when trying to remove trip creator", async () => {
      app = await buildApp();

      // Create test users
      const creatorPhone = generateUniquePhone();
      const coOrgPhone = generateUniquePhone();

      const [creator, coOrg] = await db
        .insert(users)
        .values([
          {
            phoneNumber: creatorPhone,
            displayName: "Creator",
            timezone: "UTC",
          },
          { phoneNumber: coOrgPhone, displayName: "Co-Org", timezone: "UTC" },
        ])
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Test",
          preferredTimezone: "UTC",
          createdBy: creator.id,
        })
        .returning();

      // Add both as members
      await db.insert(members).values([
        {
          userId: creator.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
        {
          userId: coOrg.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
      ]);

      // Generate token for co-organizer
      const token = app.jwt.sign({
        sub: coOrg.id,
        name: coOrg.displayName,
      });

      // Try to remove creator
      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/co-organizers/${creator.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("CANNOT_REMOVE_CREATOR");
      expect(body.error.message).toBe(
        "Cannot remove trip creator as co-organizer",
      );
    });
  });

  describe("Unauthorized Cases (401)", () => {
    it("should return 401 when no auth token provided", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "DELETE",
        url: "/api/trips/00000000-0000-0000-0000-000000000000/co-organizers/10000000-0000-4000-8000-000000000001",
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Forbidden Cases (403)", () => {
    it("should return 403 when non-organizer tries to remove co-organizer", async () => {
      app = await buildApp();

      // Create test users
      const creatorPhone = generateUniquePhone();
      const nonMemberPhone = generateUniquePhone();
      const coOrgPhone = generateUniquePhone();

      const [creator, nonMember, coOrg] = await db
        .insert(users)
        .values([
          {
            phoneNumber: creatorPhone,
            displayName: "Creator",
            timezone: "UTC",
          },
          {
            phoneNumber: nonMemberPhone,
            displayName: "Non-Member",
            timezone: "UTC",
          },
          { phoneNumber: coOrgPhone, displayName: "Co-Org", timezone: "UTC" },
        ])
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Test",
          preferredTimezone: "UTC",
          createdBy: creator.id,
        })
        .returning();

      // Add creator and co-organizer as members (organizers)
      await db.insert(members).values([
        {
          userId: creator.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
        {
          userId: coOrg.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
      ]);

      // Generate token for non-member
      const token = app.jwt.sign({
        sub: nonMember.id,
        name: nonMember.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/co-organizers/${coOrg.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
      expect(body.error.message).toContain("Permission denied:");
    });
  });

  describe("Not Found Cases (404)", () => {
    it("should return 404 when trip does not exist", async () => {
      app = await buildApp();

      // Create test user
      const creatorPhone = generateUniquePhone();
      const [creator] = await db
        .insert(users)
        .values({
          phoneNumber: creatorPhone,
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();

      const token = app.jwt.sign({
        sub: creator.id,
        name: creator.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/api/trips/00000000-0000-0000-0000-000000000000/co-organizers/10000000-0000-4000-8000-000000000001",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Trip not found");
    });

    it("should return 404 when co-organizer not found in trip", async () => {
      app = await buildApp();

      // Create test users
      const creatorPhone = generateUniquePhone();
      const nonMemberPhone = generateUniquePhone();

      const [creator, nonMember] = await db
        .insert(users)
        .values([
          {
            phoneNumber: creatorPhone,
            displayName: "Creator",
            timezone: "UTC",
          },
          {
            phoneNumber: nonMemberPhone,
            displayName: "Non-Member",
            timezone: "UTC",
          },
        ])
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Test",
          preferredTimezone: "UTC",
          createdBy: creator.id,
        })
        .returning();

      // Only add creator as member (organizer)
      await db.insert(members).values({
        userId: creator.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate token for creator
      const token = app.jwt.sign({
        sub: creator.id,
        name: creator.displayName,
      });

      // Try to remove non-member
      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/co-organizers/${nonMember.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("CO_ORGANIZER_NOT_IN_TRIP");
      expect(body.error.message).toBe("Co-organizer not found in trip");
    });
  });
});

describe("POST /api/trips/:id/cover-image", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Success Cases", () => {
    it("should upload cover image and return 200 with updated trip", async () => {
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

      // Create trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add user as member (organizer)
      await db.insert(members).values({
        userId: testUser.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Create a fake image buffer (1KB PNG)
      const imageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );

      // Create form data
      const form = new FormData();
      form.append("file", imageBuffer, {
        filename: "test.png",
        contentType: "image/png",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/cover-image`,
        cookies: {
          auth_token: token,
        },
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("trip");
      expect(body.trip).toMatchObject({
        id: trip.id,
        name: "Test Trip",
        destination: "Paris, France",
      });
      expect(body.trip.coverImageUrl).toMatch(/^\/uploads\/[a-f0-9-]+\.png$/);
    });

    it("should replace existing cover image and delete old one", async () => {
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

      // Create trip with existing cover image
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
          coverImageUrl: "/uploads/old-image.jpg",
        })
        .returning();

      const trip = tripResult[0];

      // Add user as member (organizer)
      await db.insert(members).values({
        userId: testUser.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Create a fake image buffer
      const imageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );

      // Create form data
      const form = new FormData();
      form.append("file", imageBuffer, {
        filename: "test.png",
        contentType: "image/png",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/cover-image`,
        cookies: {
          auth_token: token,
        },
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.trip.coverImageUrl).not.toBe("/uploads/old-image.jpg");
      expect(body.trip.coverImageUrl).toMatch(/^\/uploads\/[a-f0-9-]+\.png$/);
    });
  });

  describe("400 - Bad Request", () => {
    it("should return 400 when no file is uploaded", async () => {
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
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add user as member (organizer)
      await db.insert(members).values({
        userId: testUser.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/cover-image`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when file size exceeds 5MB", async () => {
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
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add user as member (organizer)
      await db.insert(members).values({
        userId: testUser.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Create a buffer larger than 5MB
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024);

      // Create form data
      const form = new FormData();
      form.append("file", largeBuffer, {
        filename: "large.png",
        contentType: "image/png",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/cover-image`,
        cookies: {
          auth_token: token,
        },
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("5MB");
    });

    it("should return 400 when file type is invalid", async () => {
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
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add user as member (organizer)
      await db.insert(members).values({
        userId: testUser.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Create a fake PDF buffer
      const pdfBuffer = Buffer.from("fake pdf content");

      // Create form data
      const form = new FormData();
      form.append("file", pdfBuffer, {
        filename: "document.pdf",
        contentType: "application/pdf",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/cover-image`,
        cookies: {
          auth_token: token,
        },
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("INVALID_FILE_TYPE");
      expect(body.error.message).toContain("Invalid file type");
    });

    it("should return 400 when trip ID is invalid UUID", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const imageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );

      // Create form data
      const form = new FormData();
      form.append("file", imageBuffer, {
        filename: "test.png",
        contentType: "image/png",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips/invalid-uuid/cover-image",
        cookies: {
          auth_token: token,
        },
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("401 - Unauthorized", () => {
    it("should return 401 when no auth token provided", async () => {
      app = await buildApp();

      const imageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );

      // Create form data
      const form = new FormData();
      form.append("file", imageBuffer, {
        filename: "test.png",
        contentType: "image/png",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips/00000000-0000-0000-0000-000000000000/cover-image",
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("403 - Forbidden", () => {
    it("should return 403 when user is not a co-organizer", async () => {
      app = await buildApp();

      // Create creator and another user
      const creatorPhone = generateUniquePhone();
      const memberPhone = generateUniquePhone();

      const [creator, member] = await db
        .insert(users)
        .values([
          {
            phoneNumber: creatorPhone,
            displayName: "Creator",
            timezone: "UTC",
          },
          {
            phoneNumber: memberPhone,
            displayName: "Member",
            timezone: "UTC",
          },
        ])
        .returning();

      // Create trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: creator.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add both as members (creator as organizer, member as regular attendee)
      await db.insert(members).values([
        {
          userId: creator.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
        {
          userId: member.id,
          tripId: trip.id,
          status: "no_response", // Regular member, not an organizer
        },
      ]);

      // Generate token for non-organizer member
      const token = app.jwt.sign({
        sub: member.id,
        name: member.displayName,
      });

      const imageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );

      // Create form data
      const form = new FormData();
      form.append("file", imageBuffer, {
        filename: "test.png",
        contentType: "image/png",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/cover-image`,
        cookies: {
          auth_token: token,
        },
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
    });
  });

  describe("404 - Not Found", () => {
    it("should return 404 when trip does not exist", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const imageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );

      // Create form data
      const form = new FormData();
      form.append("file", imageBuffer, {
        filename: "test.png",
        contentType: "image/png",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/trips/00000000-0000-0000-0000-000000000000/cover-image",
        cookies: {
          auth_token: token,
        },
        payload: form,
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });
});

describe("DELETE /api/trips/:id/cover-image", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Success Cases", () => {
    it("should delete cover image and return 200 with updated trip", async () => {
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

      // Create trip with cover image
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
          coverImageUrl: "/uploads/test-image.jpg",
        })
        .returning();

      const trip = tripResult[0];

      // Add user as member (organizer)
      await db.insert(members).values({
        userId: testUser.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/cover-image`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("trip");
      expect(body.trip).toMatchObject({
        id: trip.id,
        name: "Test Trip",
        destination: "Paris, France",
      });
      expect(body.trip.coverImageUrl).toBeNull();
    });

    it("should return 200 when trip has no cover image", async () => {
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

      // Create trip without cover image
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();

      const trip = tripResult[0];

      // Add user as member (organizer)
      await db.insert(members).values({
        userId: testUser.id,
        tripId: trip.id,
        status: "going",
        isOrganizer: true,
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/cover-image`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.trip.coverImageUrl).toBeNull();
    });
  });

  describe("400 - Bad Request", () => {
    it("should return 400 when trip ID is invalid UUID", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/api/trips/invalid-uuid/cover-image",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("401 - Unauthorized", () => {
    it("should return 401 when no auth token provided", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "DELETE",
        url: "/api/trips/00000000-0000-0000-0000-000000000000/cover-image",
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("403 - Forbidden", () => {
    it("should return 403 when user is not a co-organizer", async () => {
      app = await buildApp();

      // Create creator and another user
      const creatorPhone = generateUniquePhone();
      const memberPhone = generateUniquePhone();

      const [creator, member] = await db
        .insert(users)
        .values([
          {
            phoneNumber: creatorPhone,
            displayName: "Creator",
            timezone: "UTC",
          },
          {
            phoneNumber: memberPhone,
            displayName: "Member",
            timezone: "UTC",
          },
        ])
        .returning();

      // Create trip with cover image
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: creator.id,
          coverImageUrl: "/uploads/test-image.jpg",
        })
        .returning();

      const trip = tripResult[0];

      // Add both as members (creator as organizer, member as regular attendee)
      await db.insert(members).values([
        {
          userId: creator.id,
          tripId: trip.id,
          status: "going",
          isOrganizer: true,
        },
        {
          userId: member.id,
          tripId: trip.id,
          status: "no_response", // Regular member, not an organizer
        },
      ]);

      // Generate token for non-organizer member
      const token = app.jwt.sign({
        sub: member.id,
        name: member.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/trips/${trip.id}/cover-image`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
    });
  });

  describe("404 - Not Found", () => {
    it("should return 404 when trip does not exist", async () => {
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

      // Generate JWT token
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/api/trips/00000000-0000-0000-0000-000000000000/cover-image",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });
});

describe("GET /uploads/:filename", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Success Cases", () => {
    it("should serve uploaded image file", async () => {
      app = await buildApp();

      // Create a test image file in uploads directory
      const { writeFileSync, existsSync, mkdirSync } = await import("fs");
      const { resolve } = await import("path");

      const uploadsDir = resolve(process.cwd(), "uploads");
      if (!existsSync(uploadsDir)) {
        mkdirSync(uploadsDir, { recursive: true });
      }

      const testImagePath = resolve(uploadsDir, "test-image.png");
      const imageBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );
      writeFileSync(testImagePath, imageBuffer);

      const response = await app.inject({
        method: "GET",
        url: "/uploads/test-image.png",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("image");
    });
  });

  describe("404 - Not Found", () => {
    it("should return 404 when image file does not exist", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/uploads/non-existent-image.png",
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
