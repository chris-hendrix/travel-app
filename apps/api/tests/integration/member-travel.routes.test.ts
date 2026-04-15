import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips, members, memberTravel } from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";

describe("Member Travel Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("POST /api/trips/:tripId/member-travel", () => {
    it("should create member travel and return 201", async () => {
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
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: {
          auth_token: token,
        },
        payload: {
          travelType: "arrival",
          time: "2026-06-15T14:00:00Z",
          location: "CDG Airport",
          details: "Flight AF123 from JFK",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("memberTravel");
      expect(body.memberTravel).toMatchObject({
        travelType: "arrival",
        location: "CDG Airport",
        details: "Flight AF123 from JFK",
        tripId: trip.id,
      });
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/member-travel",
        payload: {
          travelType: "arrival",
          time: "2026-06-15T14:00:00Z",
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
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: {
          auth_token: token,
        },
        payload: {
          travelType: "arrival",
          time: "2026-06-15T14:00:00Z",
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("GET /api/trips/:tripId/member-travel", () => {
    it("should list all member travel for a trip", async () => {
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

      // Create second user
      const user2Result = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "User 2",
          timezone: "UTC",
        })
        .returning();

      const user2 = user2Result[0];

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

      const memberRecords = await db
        .insert(members)
        .values([
          {
            tripId: trip.id,
            userId: testUser.id,
            status: "going",
          },
          {
            tripId: trip.id,
            userId: user2.id,
            status: "going",
          },
        ])
        .returning();

      // Create member travel records using member IDs
      await db.insert(memberTravel).values([
        {
          tripId: trip.id,
          memberId: memberRecords[0].id,
          createdBy: testUser.id,
          travelType: "arrival",
          time: new Date("2026-06-15T14:00:00Z"),
        },
        {
          tripId: trip.id,
          memberId: memberRecords[1].id,
          createdBy: testUser.id,
          travelType: "departure",
          time: new Date("2026-06-15T10:00:00Z"),
        },
      ]);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("memberTravels");
      expect(body.memberTravels).toHaveLength(2);
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/member-travel",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/member-travel/:id", () => {
    it("should get member travel by ID", async () => {
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

      const memberRecords = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: testUser.id,
          status: "going",
        })
        .returning();

      const travelResult = await db
        .insert(memberTravel)
        .values({
          tripId: trip.id,
          memberId: memberRecords[0].id,
          createdBy: testUser.id,
          travelType: "arrival",
          time: new Date("2026-06-15T14:00:00Z"),
        })
        .returning();

      const travel = travelResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/member-travel/${travel.id}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("memberTravel");
      expect(body.memberTravel.id).toBe(travel.id);
    });

    it("should return 404 if member travel not found", async () => {
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
        url: "/api/member-travel/550e8400-e29b-41d4-a716-446655440000",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PUT /api/member-travel/:id", () => {
    it("should update member travel and return 200", async () => {
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

      const memberRecords = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: testUser.id,
          status: "going",
        })
        .returning();

      const travelResult = await db
        .insert(memberTravel)
        .values({
          tripId: trip.id,
          memberId: memberRecords[0].id,
          createdBy: testUser.id,
          travelType: "arrival",
          time: new Date("2026-06-15T14:00:00Z"),
        })
        .returning();

      const travel = travelResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/member-travel/${travel.id}`,
        cookies: {
          auth_token: token,
        },
        payload: {
          location: "JFK Airport",
          details: "Updated details",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.memberTravel.location).toBe("JFK Airport");
      expect(body.memberTravel.details).toBe("Updated details");
    });

    it("should return 403 if user lacks permission", async () => {
      app = await buildApp();

      // Create travel owner
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

      const memberRecords = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: owner.id,
          status: "going",
        })
        .returning();

      const travelResult = await db
        .insert(memberTravel)
        .values({
          tripId: trip.id,
          memberId: memberRecords[0].id,
          createdBy: owner.id,
          travelType: "arrival",
          time: new Date("2026-06-15T14:00:00Z"),
        })
        .returning();

      const travel = travelResult[0];

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
        url: `/api/member-travel/${travel.id}`,
        cookies: {
          auth_token: token,
        },
        payload: {
          location: "Unauthorized",
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("DELETE /api/member-travel/:id", () => {
    it("should soft delete member travel and return 200", async () => {
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

      const memberRecords = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: testUser.id,
          status: "going",
        })
        .returning();

      const travelResult = await db
        .insert(memberTravel)
        .values({
          tripId: trip.id,
          memberId: memberRecords[0].id,
          createdBy: testUser.id,
          travelType: "arrival",
          time: new Date("2026-06-15T14:00:00Z"),
        })
        .returning();

      const travel = travelResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/member-travel/${travel.id}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
    });
  });

  describe("POST /api/member-travel/:id/restore", () => {
    it("should restore soft-deleted member travel and return 200", async () => {
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

      const memberRecords = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: testUser.id,
          status: "going",
        })
        .returning();

      const travelResult = await db
        .insert(memberTravel)
        .values({
          tripId: trip.id,
          memberId: memberRecords[0].id,
          createdBy: testUser.id,
          travelType: "arrival",
          time: new Date("2026-06-15T14:00:00Z"),
          deletedAt: new Date(),
          deletedBy: testUser.id,
        })
        .returning();

      const travel = travelResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/member-travel/${travel.id}/restore`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("memberTravel");
      expect(body.memberTravel.deletedAt).toBeNull();
    });
  });

  describe("Entity count limits", () => {
    it("should return 400 when member travel limit exceeded", async () => {
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

      const [member] = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: testUser.id,
          status: "going",
        })
        .returning();

      // Bulk insert 20 travel entries (at the limit)
      await db.insert(memberTravel).values(
        Array.from({ length: 20 }, (_, i) => ({
          tripId: trip.id,
          memberId: member.id,
          createdBy: testUser.id,
          travelType: (i % 2 === 0 ? "arrival" : "departure") as
            | "arrival"
            | "departure",
          time: new Date(
            `2026-06-${String(15 + (i % 15)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00:00Z`,
          ),
        })),
      );

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          time: "2026-07-01T14:00:00Z",
          location: "Airport",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "MEMBER_TRAVEL_LIMIT_EXCEEDED",
          message: "Maximum 20 travel entries per member reached.",
        },
      });
    });

    it("should allow creating member travel when soft-deleted entries bring count below limit", async () => {
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

      const [member] = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: testUser.id,
          status: "going",
        })
        .returning();

      // Insert 19 active travel entries + 1 soft-deleted
      await db.insert(memberTravel).values(
        Array.from({ length: 19 }, (_, i) => ({
          tripId: trip.id,
          memberId: member.id,
          createdBy: testUser.id,
          travelType: (i % 2 === 0 ? "arrival" : "departure") as
            | "arrival"
            | "departure",
          time: new Date(
            `2026-06-${String(15 + (i % 15)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00:00Z`,
          ),
        })),
      );

      // Insert 1 soft-deleted entry (should not count)
      await db.insert(memberTravel).values({
        tripId: trip.id,
        memberId: member.id,
        createdBy: testUser.id,
        travelType: "arrival" as const,
        time: new Date("2026-07-01T12:00:00Z"),
        deletedAt: new Date(),
        deletedBy: testUser.id,
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          time: "2026-07-01T14:00:00Z",
          location: "Airport",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.memberTravel.travelType).toBe("arrival");
    });
  });

  describe("Member travel delegation", () => {
    it("should create member travel for another member as organizer (201)", async () => {
      app = await buildApp();

      // Create organizer user
      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      // Create regular user
      const [regularUser] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Regular User",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Delegation Trip",
          destination: "Tokyo",
          preferredTimezone: "Asia/Tokyo",
          createdBy: organizer.id,
        })
        .returning();

      // Add organizer as member (isOrganizer)
      await db.insert(members).values({
        tripId: trip.id,
        userId: organizer.id,
        status: "going",
        isOrganizer: true,
      });

      // Add regular user as member
      const [regularMember] = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: regularUser.id,
          status: "going",
        })
        .returning();

      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          time: "2026-06-10T14:00:00Z",
          location: "Airport",
          details: "Flight AA123",
          memberId: regularMember.id,
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.memberTravel.memberId).toBe(regularMember.id);
      expect(body.memberTravel.travelType).toBe("arrival");
      expect(body.memberTravel.location).toBe("Airport");
    });

    it("should return 403 when non-organizer creates travel with memberId", async () => {
      app = await buildApp();

      // Create organizer (trip creator)
      const [organizer] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Organizer",
          timezone: "UTC",
        })
        .returning();

      // Create two regular users
      const [user1] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "User 1",
          timezone: "UTC",
        })
        .returning();

      const [user2] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "User 2",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Delegation Trip",
          destination: "Tokyo",
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

      // Add user1 and user2 as regular members
      await db.insert(members).values({
        tripId: trip.id,
        userId: user1.id,
        status: "going",
      });

      const [member2] = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: user2.id,
          status: "going",
        })
        .returning();

      // user1 tries to create travel for user2 (not organizer)
      const token = app.jwt.sign({
        sub: user1.id,
        name: user1.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          time: "2026-06-10T14:00:00Z",
          location: "Airport",
          details: "Flight AA123",
          memberId: member2.id,
        },
      });

      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
    });

    it("should return 404 when memberId does not belong to trip", async () => {
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
          name: "Delegation Trip",
          destination: "Tokyo",
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

      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          time: "2026-06-10T14:00:00Z",
          location: "Airport",
          details: "Flight AA123",
          memberId: "00000000-0000-0000-0000-000000000000",
        },
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("MEMBER_NOT_FOUND");
    });

    it("should create member travel for self without memberId (backward compatibility)", async () => {
      app = await buildApp();

      // Create user
      const [user] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Regular User",
          timezone: "UTC",
        })
        .returning();

      // Create trip
      const [trip] = await db
        .insert(trips)
        .values({
          name: "Self Trip",
          destination: "Berlin",
          preferredTimezone: "Europe/Berlin",
          createdBy: user.id,
        })
        .returning();

      // Add as member
      const [member] = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: user.id,
          status: "going",
        })
        .returning();

      const token = app.jwt.sign({
        sub: user.id,
        name: user.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/member-travel`,
        cookies: { auth_token: token },
        payload: {
          travelType: "arrival",
          time: "2026-06-10T14:00:00Z",
          location: "Airport",
          details: "Flight AA123",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.memberTravel.memberId).toBe(member.id);
    });
  });
});
