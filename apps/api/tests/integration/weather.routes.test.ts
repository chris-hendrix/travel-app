import { describe, it, expect, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips, members } from "@/db/schema/index.js";
import { generateUniquePhone } from "../test-utils.js";

describe("Weather Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (app) {
      await app.close();
    }
  });

  describe("GET /api/trips/:tripId/weather", () => {
    it("returns weather forecast for valid trip member", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Weather User",
          timezone: "UTC",
        })
        .returning();
      const testUser = testUserResult[0];

      // Create trip with coordinates and dates
      const today = new Date();
      const startDate = today.toISOString().slice(0, 10);
      const endDate = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      const tripResult = await db
        .insert(trips)
        .values({
          name: "San Diego Trip",
          destination: "San Diego",
          destinationLat: 32.7157,
          destinationLon: -117.1611,
          startDate,
          endDate,
          preferredTimezone: "America/Los_Angeles",
          createdBy: testUser.id,
        })
        .returning();
      const trip = tripResult[0];

      // Add membership
      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      // Sign JWT
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Mock Open-Meteo response
      const mockResponse = {
        daily: {
          time: [startDate],
          weather_code: [0],
          temperature_2m_max: [25],
          temperature_2m_min: [15],
          precipitation_probability_max: [10],
        },
      };
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/weather`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.weather.available).toBe(true);
      expect(Array.isArray(body.weather.forecasts)).toBe(true);
    });

    it("returns unavailable when trip has no coordinates", async () => {
      app = await buildApp();

      // Create test user
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "No Coords User",
          timezone: "UTC",
        })
        .returning();
      const testUser = testUserResult[0];

      // Create trip WITHOUT coordinates but with dates
      const today = new Date();
      const startDate = today.toISOString().slice(0, 10);
      const endDate = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      const tripResult = await db
        .insert(trips)
        .values({
          name: "No Coords Trip",
          destination: "Somewhere",
          startDate,
          endDate,
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();
      const trip = tripResult[0];

      // Add membership
      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      // Sign JWT
      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/weather`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.weather.available).toBe(false);
      expect(body.weather.message).toContain("destination");
    });

    it("returns 401 when not authenticated", async () => {
      app = await buildApp();

      // Create a trip (just need a valid trip ID in the URL)
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Auth Test User",
          timezone: "UTC",
        })
        .returning();
      const testUser = testUserResult[0];

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Auth Test Trip",
          destination: "Nowhere",
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();
      const trip = tripResult[0];

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/weather`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 404 for non-member", async () => {
      app = await buildApp();

      // Create two users
      const user1Result = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Trip Owner",
          timezone: "UTC",
        })
        .returning();
      const user1 = user1Result[0];

      const user2Result = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Non Member",
          timezone: "UTC",
        })
        .returning();
      const user2 = user2Result[0];

      // Create trip owned by user1
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Private Trip",
          destination: "Secret Place",
          preferredTimezone: "UTC",
          createdBy: user1.id,
        })
        .returning();
      const trip = tripResult[0];

      // Only add membership for user1
      await db.insert(members).values({
        tripId: trip.id,
        userId: user1.id,
        status: "going",
      });

      // Sign token for user2 (non-member)
      const token = app.jwt.sign({
        sub: user2.id,
        name: user2.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/weather`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 400 for invalid trip ID format", async () => {
      app = await buildApp();

      // Create user and sign token
      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Format Test User",
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
        url: "/api/trips/not-a-uuid/weather",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
