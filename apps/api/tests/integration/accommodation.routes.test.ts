import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips, members, accommodations } from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";

describe("Accommodation Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("POST /api/trips/:tripId/accommodations", () => {
    it("should create accommodation and return 201", async () => {
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
        url: `/api/trips/${trip.id}/accommodations`,
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Hotel Luxury",
          checkIn: "2026-06-15T14:00:00.000Z",
          checkOut: "2026-06-20T11:00:00.000Z",
          address: "123 Main St, Paris",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("accommodation");
      expect(body.accommodation).toMatchObject({
        name: "Hotel Luxury",
        address: "123 Main St, Paris",
        tripId: trip.id,
        createdBy: testUser.id,
      });
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/accommodations",
        payload: {
          name: "Test Hotel",
          checkIn: "2026-06-15T14:00:00.000Z",
          checkOut: "2026-06-20T11:00:00.000Z",
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
        url: `/api/trips/${trip.id}/accommodations`,
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Unauthorized Hotel",
          checkIn: "2026-06-15T14:00:00.000Z",
          checkOut: "2026-06-20T11:00:00.000Z",
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("GET /api/trips/:tripId/accommodations", () => {
    it("should list all accommodations for a trip", async () => {
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

      // Create accommodations
      await db.insert(accommodations).values([
        {
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Hotel 1",
          checkIn: new Date("2026-06-15T15:00:00Z"),
          checkOut: new Date("2026-06-20T11:00:00Z"),
        },
        {
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Hotel 2",
          checkIn: new Date("2026-06-21T15:00:00Z"),
          checkOut: new Date("2026-06-25T11:00:00Z"),
        },
      ]);

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/accommodations`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("accommodations");
      expect(body.accommodations).toHaveLength(2);
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/accommodations",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/accommodations/:id", () => {
    it("should get accommodation by ID", async () => {
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

      const accommodationResult = await db
        .insert(accommodations)
        .values({
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Test Hotel",
          checkIn: new Date("2026-06-15T15:00:00Z"),
          checkOut: new Date("2026-06-20T11:00:00Z"),
        })
        .returning();

      const accommodation = accommodationResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/accommodations/${accommodation.id}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("accommodation");
      expect(body.accommodation.id).toBe(accommodation.id);
    });

    it("should return 404 if accommodation not found", async () => {
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
        url: "/api/accommodations/550e8400-e29b-41d4-a716-446655440000",
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PUT /api/accommodations/:id", () => {
    it("should update accommodation and return 200", async () => {
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

      const accommodationResult = await db
        .insert(accommodations)
        .values({
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Original Hotel",
          checkIn: new Date("2026-06-15T15:00:00Z"),
          checkOut: new Date("2026-06-20T11:00:00Z"),
        })
        .returning();

      const accommodation = accommodationResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PUT",
        url: `/api/accommodations/${accommodation.id}`,
        cookies: {
          auth_token: token,
        },
        payload: {
          name: "Updated Hotel",
          address: "456 New Street",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body.accommodation.name).toBe("Updated Hotel");
      expect(body.accommodation.address).toBe("456 New Street");
    });

    it("should return 403 if user lacks permission", async () => {
      app = await buildApp();

      // Create accommodation owner
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

      const accommodationResult = await db
        .insert(accommodations)
        .values({
          tripId: trip.id,
          createdBy: owner.id,
          name: "Test Hotel",
          checkIn: new Date("2026-06-15T15:00:00Z"),
          checkOut: new Date("2026-06-20T11:00:00Z"),
        })
        .returning();

      const accommodation = accommodationResult[0];

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
        url: `/api/accommodations/${accommodation.id}`,
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

  describe("DELETE /api/accommodations/:id", () => {
    it("should soft delete accommodation and return 200", async () => {
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

      const accommodationResult = await db
        .insert(accommodations)
        .values({
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Test Hotel",
          checkIn: new Date("2026-06-15T15:00:00Z"),
          checkOut: new Date("2026-06-20T11:00:00Z"),
        })
        .returning();

      const accommodation = accommodationResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/accommodations/${accommodation.id}`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
    });
  });

  describe("POST /api/accommodations/:id/restore", () => {
    it("should restore soft-deleted accommodation and return 200", async () => {
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

      const accommodationResult = await db
        .insert(accommodations)
        .values({
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Test Hotel",
          checkIn: new Date("2026-06-15T15:00:00Z"),
          checkOut: new Date("2026-06-20T11:00:00Z"),
          deletedAt: new Date(),
          deletedBy: testUser.id,
        })
        .returning();

      const accommodation = accommodationResult[0];

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/accommodations/${accommodation.id}/restore`,
        cookies: {
          auth_token: token,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("accommodation");
      expect(body.accommodation.deletedAt).toBeNull();
    });
  });

  describe("Entity count limits", () => {
    it("should return 400 when accommodation limit exceeded", async () => {
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

      // Bulk insert 10 accommodations (at the limit)
      await db.insert(accommodations).values(
        Array.from({ length: 10 }, (_, i) => ({
          tripId: trip.id,
          createdBy: testUser.id,
          name: `Hotel ${i + 1}`,
          checkIn: new Date(
            `2026-06-${String(15 + i).padStart(2, "0")}T15:00:00Z`,
          ),
          checkOut: new Date(
            `2026-06-${String(16 + i).padStart(2, "0")}T11:00:00Z`,
          ),
        })),
      );

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/accommodations`,
        cookies: { auth_token: token },
        payload: {
          name: "One Too Many Hotel",
          checkIn: "2026-07-01T14:00:00.000Z",
          checkOut: "2026-07-05T11:00:00.000Z",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "ACCOMMODATION_LIMIT_EXCEEDED",
          message: "Maximum 10 accommodations per trip reached.",
        },
      });
    });

    it("should allow creating accommodation when soft-deleted ones bring count below limit", async () => {
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

      // Insert 9 active accommodations + 1 soft-deleted
      await db.insert(accommodations).values(
        Array.from({ length: 9 }, (_, i) => ({
          tripId: trip.id,
          createdBy: testUser.id,
          name: `Hotel ${i + 1}`,
          checkIn: new Date(
            `2026-06-${String(15 + i).padStart(2, "0")}T15:00:00Z`,
          ),
          checkOut: new Date(
            `2026-06-${String(16 + i).padStart(2, "0")}T11:00:00Z`,
          ),
        })),
      );

      // Insert 1 soft-deleted accommodation (should not count)
      await db.insert(accommodations).values({
        tripId: trip.id,
        createdBy: testUser.id,
        name: "Deleted Hotel",
        checkIn: new Date("2026-07-01T15:00:00Z"),
        checkOut: new Date("2026-07-05T11:00:00Z"),
        deletedAt: new Date(),
        deletedBy: testUser.id,
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/accommodations`,
        cookies: { auth_token: token },
        payload: {
          name: "Should Succeed Hotel",
          checkIn: "2026-07-10T14:00:00.000Z",
          checkOut: "2026-07-15T11:00:00.000Z",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.accommodation.name).toBe("Should Succeed Hotel");
    });
  });

});
