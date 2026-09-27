import { describe, it, expect, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";

async function makeUser(app: FastifyInstance) {
  const [user] = await db
    .insert(users)
    .values({
      phoneNumber: generateUniquePhone(),
      displayName: "Place User",
      timezone: "UTC",
    })
    .returning();
  const token = app.jwt.sign({ sub: user.id, name: user.displayName });
  return token;
}

describe("POST /api/trips destinationDisplayName (Phase 14 RED)", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
    vi.restoreAllMocks();
  });

  it("stores an explicit destinationDisplayName verbatim and skips geocoding", async () => {
    app = await buildApp();
    const token = await makeUser(app);
    const geocodeSpy = vi.spyOn(app.geocodingService, "geocode");

    const response = await app.inject({
      method: "POST",
      url: "/api/trips",
      cookies: { auth_token: token },
      payload: {
        name: "Picked Trip",
        destination: "La Bodega",
        timezone: "Europe/Madrid",
        placeProvider: "google",
        externalPlaceId: "ChIJ123",
        destinationLat: 39.7,
        destinationLon: 2.9,
        destinationDisplayName: "La Bodega, Sóller",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    const [row] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, body.trip.id))
      .limit(1);
    expect(row?.destinationDisplayName).toBe("La Bodega, Sóller");
    expect(row?.placeProvider).toBe("google");
    expect(row?.externalPlaceId).toBe("ChIJ123");
    expect(geocodeSpy).not.toHaveBeenCalled();
  });

  it("stores null with coordinates but no display name and makes no geocoding call", async () => {
    app = await buildApp();
    const token = await makeUser(app);
    const geocodeSpy = vi.spyOn(app.geocodingService, "geocode");

    const response = await app.inject({
      method: "POST",
      url: "/api/trips",
      cookies: { auth_token: token },
      payload: {
        name: "Coord Trip",
        destination: "Somewhere",
        timezone: "Europe/Madrid",
        destinationLat: 39.7,
        destinationLon: 2.9,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    const [row] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, body.trip.id))
      .limit(1);
    expect(row?.destinationDisplayName).toBeNull();
    expect(geocodeSpy).not.toHaveBeenCalled();
  });
});
