import { describe, it, expect, afterEach, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips, members, poiCache } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";
import { env } from "@/config/env.js";

describe("Discover Routes Debug", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("debug cached results", async () => {
    app = await buildApp();

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

    console.log("STATUS:", response.statusCode);
    console.log("BODY:", response.body);

    expect(response.statusCode).toBe(200);
  });
});
