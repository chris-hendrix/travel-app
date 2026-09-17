import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips, members, events, poiCache, poiConversions } from "@/db/schema/index.js";
import { and, eq } from "drizzle-orm";
import { roundCoords } from "@/services/discover.service.js";
import { generateUniquePhone } from "../test-utils.js";
import { env } from "@/config/env.js";

describe("Discover Routes", () => {
  let app: FastifyInstance;
  let originalGoogleKey: string;

  beforeAll(() => {
    originalGoogleKey = env.GOOGLE_MAPS_API_KEY;
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    (env as { GOOGLE_MAPS_API_KEY: string }).GOOGLE_MAPS_API_KEY = originalGoogleKey;
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

    it("returns 503 when GOOGLE_MAPS_API_KEY is not set", async () => {
      vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
      (env as { GOOGLE_MAPS_API_KEY: string }).GOOGLE_MAPS_API_KEY = "";

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

      // Ensure no shared global cache row exists for this cell (cache is
      // coords-keyed and shared across trips/suite runs — a leftover row
      // would serve a 200 instead of the expected 503).
      const noKeyCell = roundCoords(48.8566, 2.3522);
      await db
        .delete(poiCache)
        .where(
          and(eq(poiCache.lat, noKeyCell.lat), eq(poiCache.lon, noKeyCell.lon)),
        );

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

      // Clean up test data
      const tripRows = await db
        .select({ id: trips.id })
        .from(trips)
        .where(eq(trips.name, "Discover Test Trip"))
        .limit(1);
      if (tripRows.length > 0) {
        await db
          .delete(poiCache)
          .where(
            and(eq(poiCache.lat, noKeyCell.lat), eq(poiCache.lon, noKeyCell.lon)),
          );
        await db
          .delete(members)
          .where(eq(members.tripId, tripRows[0]!.id));
        await db
          .delete(trips)
          .where(eq(trips.id, tripRows[0]!.id));
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
        wellness: [],
        shopping: [],
        lodging: [],
      });

      // Cleanup
      await db.delete(members).where(eq(members.tripId, trip.id));
      await db.delete(trips).where(eq(trips.id, trip.id));
      await db.delete(users).where(eq(users.id, testUser.id));
    });

    it("returns 200 with cached results if POI cache exists", async () => {
      app = await buildApp();

      // Only run if API key is available, otherwise skip
      if (!env.GOOGLE_MAPS_API_KEY) {
        console.log("Skipping — GOOGLE_MAPS_API_KEY not set");
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

      // Insert a global coords-keyed POI cache row directly (shared cell)
      const cacheCell = roundCoords(48.8566, 2.3522);
      await db
        .delete(poiCache)
        .where(
          and(eq(poiCache.lat, cacheCell.lat), eq(poiCache.lon, cacheCell.lon)),
        );
      await db.insert(poiCache).values({
        lat: cacheCell.lat,
        lon: cacheCell.lon,
        source: "google",
        location: "Paris, France",
        cachedAt: new Date(),
        suggestions: [
          {
            sourceId: "ChIJ-cached-1",
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
            photoName: null,
            photoAttribution: null,
            googleMapsUri: null,
            businessStatus: null,
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
      expect(body.data.categories.wellness).toEqual([]);
      expect(body.data.categories.shopping).toEqual([]);

      // Cleanup
      await db
        .delete(poiCache)
        .where(
          and(eq(poiCache.lat, cacheCell.lat), eq(poiCache.lon, cacheCell.lon)),
        );
      await db.delete(members).where(eq(members.tripId, trip.id));
      await db.delete(trips).where(eq(trips.id, trip.id));
      await db.delete(users).where(eq(users.id, testUser.id));
    });

    it("supports refresh=true to bypass cache", async () => {
      app = await buildApp();

      if (!env.GOOGLE_MAPS_API_KEY) {
        console.log("Skipping — GOOGLE_MAPS_API_KEY not set");
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
      expect(body.data.source).toBe("google");

      // Cleanup the shared global cell (refresh upserts it)
      const refreshCell = roundCoords(48.8566, 2.3522);
      await db
        .delete(poiCache)
        .where(
          and(eq(poiCache.lat, refreshCell.lat), eq(poiCache.lon, refreshCell.lon)),
        );
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
        payload: { sourceId: "ChIJ-1", eventId: "evt-1" },
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

      // Seed the shared global cell with a POI to convert (blob is global
      // and immutable — conversions live in the poi_conversions overlay)
      const convertCell = roundCoords(48.8566, 2.3522);
      await db
        .delete(poiCache)
        .where(
          and(eq(poiCache.lat, convertCell.lat), eq(poiCache.lon, convertCell.lon)),
        );
      await db.insert(poiCache).values({
        lat: convertCell.lat,
        lon: convertCell.lon,
        source: "google",
        location: "Paris",
        cachedAt: new Date(),
        suggestions: [
          {
            sourceId: "ChIJ-convert-me",
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
            photoName: null,
            photoAttribution: null,
            googleMapsUri: null,
            businessStatus: null,
          },
        ],
      });
      const blobBefore = JSON.stringify(
        (
          await db
            .select()
            .from(poiCache)
            .where(
              and(
                eq(poiCache.lat, convertCell.lat),
                eq(poiCache.lon, convertCell.lon),
              ),
            )
        )[0]!.suggestions,
      );

      // Overlay rows reference events — create a real event for the FK
      const [convertEvent] = await db
        .insert(events)
        .values({
          tripId: trip.id,
          createdBy: testUser.id,
          name: "Converted POI Event",
          eventType: "food_and_drink",
          startTime: new Date(),
        })
        .returning();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/trips/${trip.id}/discover/convert`,
        cookies: { auth_token: token },
        payload: { sourceId: "ChIJ-convert-me", eventId: convertEvent!.id },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // Overlay row recorded for this trip
      const overlay = await db
        .select()
        .from(poiConversions)
        .where(
          and(
            eq(poiConversions.tripId, trip.id),
            eq(poiConversions.sourceId, "ChIJ-convert-me"),
          ),
        );
      expect(overlay).toHaveLength(1);
      expect(overlay[0]!.eventId).toBe(convertEvent!.id);

      // Global blob untouched by the conversion
      const [cacheAfter] = await db
        .select()
        .from(poiCache)
        .where(
          and(
            eq(poiCache.lat, convertCell.lat),
            eq(poiCache.lon, convertCell.lon),
          ),
        );
      expect(JSON.stringify(cacheAfter!.suggestions)).toBe(blobBefore);

      // Converted POI filtered from this trip's reads via the overlay
      const getResponse = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/discover`,
        cookies: { auth_token: token },
      });
      expect(getResponse.statusCode).toBe(200);
      const getBody = JSON.parse(getResponse.body);
      expect(getBody.success).toBe(true);
      expect(getBody.data.categories.food_and_drink).toEqual([]);

      // Cleanup
      await db.delete(poiConversions).where(eq(poiConversions.tripId, trip.id));
      await db.delete(events).where(eq(events.tripId, trip.id));
      await db
        .delete(poiCache)
        .where(
          and(eq(poiCache.lat, convertCell.lat), eq(poiCache.lon, convertCell.lon)),
        );
      await db.delete(members).where(eq(members.tripId, trip.id));
      await db.delete(trips).where(eq(trips.id, trip.id));
      await db.delete(users).where(eq(users.id, testUser.id));
    });
  });
});
