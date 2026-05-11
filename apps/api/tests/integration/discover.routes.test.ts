import { describe, it, expect, afterEach, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips, members, poiCache } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";
import { env } from "@/config/env.js";

describe("Discover Routes", () => {
  let app: FastifyInstance;
  let originalFsqKey: string;

  beforeAll(() => {
    originalFsqKey = env.FOURSQUARE_API_KEY;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("GET /api/trips/:tripId/discover", () => {
    it("returns 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/discover",
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 503 when FOURSQUARE_API_KEY is not set", async () => {
      // Temporarily clear the API key for this test
      (env as { FOURSQUARE_API_KEY: string }).FOURSQUARE_API_KEY = "";
      try {
        app = await buildApp();

        const testUserResult = await db
          .insert(users)
          .values({
            phoneNumber: generateUniquePhone(),
            displayName: "Discover Test User",
            timezone: "UTC",
          })
          .returning();
        const testUser = testUserResult[0]!;

        const tripResult = await db
          .insert(trips)
          .values({
            name: "Discover Test Trip",
            destination: "Paris",
            destinationLat: 48.8566,
            destinationLon: 2.3522,
            preferredTimezone: "Europe/Paris",
            createdBy: testUser.id,
          })
          .returning();
        const trip = tripResult[0]!;

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
          method: "GET",
          url: `/api/trips/${trip.id}/discover`,
          cookies: { auth_token: token },
        });

        expect(response.statusCode).toBe(503);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
      } finally {
        (env as { FOURSQUARE_API_KEY: string }).FOURSQUARE_API_KEY =
          originalFsqKey;
        // Clean up test data
        await db
          .delete(poiCache)
          .where(eq(poiCache.tripId, (
            await db
              .select({ id: trips.id })
              .from(trips)
              .where(eq(trips.name, "Discover Test Trip"))
              .limit(1)
          ).at(0)?.id ?? ""));
        const tripRows = await db
          .select({ id: trips.id })
          .from(trips)
          .where(eq(trips.name, "Discover Test Trip"))
          .limit(1);
        if (tripRows.length > 0) {
          await db
            .delete(members)
            .where(eq(members.tripId, tripRows[0]!.id));
          await db
            .delete(trips)
            .where(eq(trips.id, tripRows[0]!.id));
        }
      }
    });

    it("returns 404 (via TripNotFoundError) when user is not a trip member", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Non-Member User",
          timezone: "UTC",
        })
        .returning();
      const testUser = testUserResult[0]!;

      const ownerResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Trip Owner",
          timezone: "UTC",
        })
        .returning();
      const owner = ownerResult[0]!;

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Owner's Trip",
          destination: "Paris",
          destinationLat: 48.8566,
          destinationLon: 2.3522,
          preferredTimezone: "Europe/Paris",
          createdBy: owner.id,
        })
        .returning();
      const trip = tripResult[0]!;

      await db.insert(members).values({
        tripId: trip.id,
        userId: owner.id,
        status: "going",
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/discover`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(404);

      // Cleanup
      await db.delete(members).where(eq(members.tripId, trip.id));
      await db.delete(trips).where(eq(trips.id, trip.id));
      await db.delete(users).where(eq(users.id, testUser.id));
      await db.delete(users).where(eq(users.id, owner.id));
    });

    it("returns empty categories when destination has no lat/lon", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "No Dest User",
          timezone: "UTC",
        })
        .returning();
      const testUser = testUserResult[0]!;

      const tripResult = await db
        .insert(trips)
        .values({
          name: "No Destination Trip",
          destination: "Unknown",
          destinationLat: null,
          destinationLon: null,
          preferredTimezone: "UTC",
          createdBy: testUser.id,
        })
        .returning();
      const trip = tripResult[0]!;

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
        method: "GET",
        url: `/api/trips/${trip.id}/discover`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      // destination is shown since trips.destination is set, but lat/lon are null
      expect(body.data.destination).toBe("Unknown");
      expect(body.data.categories).toEqual({
        food_and_drink: [],
        arts_and_entertainment: [],
        outdoors: [],
        nightlife: [],
      });

      // Cleanup
      await db.delete(members).where(eq(members.tripId, trip.id));
      await db.delete(trips).where(eq(trips.id, trip.id));
      await db.delete(users).where(eq(users.id, testUser.id));
    });

    it("returns 200 with cached results if POI cache exists", async () => {
      app = await buildApp();

      // Only run if API key is available, otherwise skip
      if (!env.FOURSQUARE_API_KEY) {
        console.log("Skipping — FOURSQUARE_API_KEY not set");
        return;
      }

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Cache Test User",
          timezone: "UTC",
        })
        .returning();
      const testUser = testUserResult[0]!;

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Cache Test Trip",
          destination: "Paris",
          destinationLat: 48.8566,
          destinationLon: 2.3522,
          destinationDisplayName: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();
      const trip = tripResult[0]!;

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      // Insert a POI cache row directly
      await db.insert(poiCache).values({
        tripId: trip.id,
        source: "foursquare",
        searchLat: 48.8566,
        searchLon: 2.3522,
        searchLocation: "Paris, France",
        cachedAt: new Date(),
        suggestions: [
          {
            sourceId: "fsq-cached-1",
            name: "Cached Bistro",
            address: "1 Rue de Paris",
            lat: 48.8566,
            lon: 2.3522,
            distance: 200,
            category: "food_and_drink",
            popularity: null,
            price: null,
            rating: null,
            website: null,
            tel: null,
            subcategory: null,
            eventId: null,
          },
        ],
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/discover`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.destination).toBe("Paris, France");
      expect(body.data.categories.food_and_drink).toHaveLength(1);
      expect(body.data.categories.food_and_drink[0].name).toBe("Cached Bistro");
      expect(body.data.categories.arts_and_entertainment).toEqual([]);
      expect(body.data.categories.outdoors).toEqual([]);
      expect(body.data.categories.nightlife).toEqual([]);

      // Cleanup
      await db.delete(poiCache).where(eq(poiCache.tripId, trip.id));
      await db.delete(members).where(eq(members.tripId, trip.id));
      await db.delete(trips).where(eq(trips.id, trip.id));
      await db.delete(users).where(eq(users.id, testUser.id));
    });

    it("supports refresh=true to bypass cache", async () => {
      app = await buildApp();

      if (!env.FOURSQUARE_API_KEY) {
        console.log("Skipping — FOURSQUARE_API_KEY not set");
        return;
      }

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Refresh Test User",
          timezone: "UTC",
        })
        .returning();
      const testUser = testUserResult[0]!;

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Refresh Test Trip",
          destination: "Paris",
          destinationLat: 48.8566,
          destinationLon: 2.3522,
          destinationDisplayName: "Paris, France",
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();
      const trip = tripResult[0]!;

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
        method: "GET",
        url: `/api/trips/${trip.id}/discover?refresh=true`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.source).toBe("foursquare");

      // Cleanup
      await db.delete(poiCache).where(eq(poiCache.tripId, trip.id));
      await db.delete(members).where(eq(members.tripId, trip.id));
      await db.delete(trips).where(eq(trips.id, trip.id));
      await db.delete(users).where(eq(users.id, testUser.id));
    });
  });

  describe("PATCH /api/trips/:tripId/discover/convert", () => {
    it("returns 401 if not authenticated", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "PATCH",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/discover/convert",
        payload: { sourceId: "fsq-1", eventId: "evt-1" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("marks a POI as converted in the cache", async () => {
      app = await buildApp();

      const testUserResult = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Convert Test User",
          timezone: "UTC",
        })
        .returning();
      const testUser = testUserResult[0]!;

      const tripResult = await db
        .insert(trips)
        .values({
          name: "Convert Test Trip",
          destination: "Paris",
          destinationLat: 48.8566,
          destinationLon: 2.3522,
          preferredTimezone: "Europe/Paris",
          createdBy: testUser.id,
        })
        .returning();
      const trip = tripResult[0]!;

      await db.insert(members).values({
        tripId: trip.id,
        userId: testUser.id,
        status: "going",
      });

      // Insert cache row with a POI to convert
      await db.insert(poiCache).values({
        tripId: trip.id,
        source: "foursquare",
        searchLat: 48.8566,
        searchLon: 2.3522,
        searchLocation: "Paris",
        cachedAt: new Date(),
        suggestions: [
          {
            sourceId: "fsq-convert-me",
            name: "Convertible Place",
            address: "2 Rue Example",
            lat: 48.8566,
            lon: 2.3522,
            distance: 300,
            category: "food_and_drink",
            popularity: null,
            price: null,
            rating: null,
            website: null,
            tel: null,
            subcategory: null,
            eventId: null,
          },
        ],
      });

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/trips/${trip.id}/discover/convert`,
        cookies: { auth_token: token },
        payload: { sourceId: "fsq-convert-me", eventId: "evt-converted-123" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // Verify the POI now has eventId set
      const cacheRow = await db
        .select()
        .from(poiCache)
        .where(eq(poiCache.tripId, trip.id))
        .limit(1);
      expect(cacheRow.length).toBe(1);
      const suggestion = (cacheRow[0]!.suggestions as Array<Record<string, unknown>>).find(
        (s) => s.sourceId === "fsq-convert-me",
      );
      expect(suggestion).toBeDefined();
      expect(suggestion!.eventId).toBe("evt-converted-123");

      // Cleanup
      await db.delete(poiCache).where(eq(poiCache.tripId, trip.id));
      await db.delete(members).where(eq(members.tripId, trip.id));
      await db.delete(trips).where(eq(trips.id, trip.id));
      await db.delete(users).where(eq(users.id, testUser.id));
    });
  });
});
