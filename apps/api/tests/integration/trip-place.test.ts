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

describe("POST /api/trips placeName (Phase 14 RED)", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
    vi.restoreAllMocks();
  });

  it("stores an explicit placeName verbatim and skips geocoding", async () => {
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
        placeId: "ChIJ123",
        destinationLat: 39.7,
        destinationLon: 2.9,
        placeName: "La Bodega, Sóller",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    const [row] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, body.trip.id))
      .limit(1);
    expect(row?.placeName).toBe("La Bodega, Sóller");
    expect(row?.placeProvider).toBe("google");
    expect(row?.placeId).toBe("ChIJ123");
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
    expect(row?.placeName).toBeNull();
    expect(geocodeSpy).not.toHaveBeenCalled();
  });
});

describe("PUT /api/trips place-block normalization (P0: replaced pair)", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
    vi.restoreAllMocks();
  });

  async function makeLinkedTrip(token: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/trips",
      cookies: { auth_token: token },
      payload: {
        name: "Linked Trip",
        destination: "La Bodega",
        timezone: "Europe/Madrid",
        placeProvider: "google",
        placeId: "ChIJ_AAA",
        placeName: "La Bodega",
        placeAddress: "Carrer de la Mar 14, Sóller",
      },
    });
    expect(response.statusCode).toBe(201);
    return (JSON.parse(response.body).trip as { id: string }).id;
  }

  it("clears name/address when the pair is replaced without a snapshot", async () => {
    app = await buildApp();
    const token = await makeUser(app);
    const tripId = await makeLinkedTrip(token);

    const response = await app.inject({
      method: "PUT",
      url: `/api/trips/${tripId}`,
      cookies: { auth_token: token },
      payload: { placeProvider: "google", placeId: "ChIJ_BBB" },
    });
    expect(response.statusCode).toBe(200);
    const [row] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    expect(row?.placeProvider).toBe("google");
    expect(row?.placeId).toBe("ChIJ_BBB");
    expect(row?.placeName).toBeNull();
    expect(row?.placeAddress).toBeNull();
  });

  it("leaves the snapshot untouched when the identical pair is re-sent", async () => {
    app = await buildApp();
    const token = await makeUser(app);
    const tripId = await makeLinkedTrip(token);

    const response = await app.inject({
      method: "PUT",
      url: `/api/trips/${tripId}`,
      cookies: { auth_token: token },
      payload: { placeProvider: "google", placeId: "ChIJ_AAA" },
    });
    expect(response.statusCode).toBe(200);
    const [row] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    expect(row?.placeId).toBe("ChIJ_AAA");
    expect(row?.placeName).toBe("La Bodega");
    expect(row?.placeAddress).toBe("Carrer de la Mar 14, Sóller");
  });

  it("honors an explicit snapshot on a replaced pair", async () => {
    app = await buildApp();
    const token = await makeUser(app);
    const tripId = await makeLinkedTrip(token);

    const response = await app.inject({
      method: "PUT",
      url: `/api/trips/${tripId}`,
      cookies: { auth_token: token },
      payload: {
        placeProvider: "google",
        placeId: "ChIJ_BBB",
        placeName: "Ca'n Prunera",
        placeAddress: "Carrer de la Lluna 7, Sóller",
      },
    });
    expect(response.statusCode).toBe(200);
    const [row] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    expect(row?.placeId).toBe("ChIJ_BBB");
    expect(row?.placeName).toBe("Ca'n Prunera");
    expect(row?.placeAddress).toBe("Carrer de la Lluna 7, Sóller");
  });

  it("leaves the columns untouched when pair and snapshot keys are absent", async () => {
    app = await buildApp();
    const token = await makeUser(app);
    const tripId = await makeLinkedTrip(token);

    const response = await app.inject({
      method: "PUT",
      url: `/api/trips/${tripId}`,
      cookies: { auth_token: token },
      payload: { name: "Renamed Trip" },
    });
    expect(response.statusCode).toBe(200);
    const [row] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    expect(row?.placeId).toBe("ChIJ_AAA");
    expect(row?.placeName).toBe("La Bodega");
    expect(row?.placeAddress).toBe("Carrer de la Mar 14, Sóller");
  });

  it("clears all four values on an explicit null pair", async () => {
    app = await buildApp();
    const token = await makeUser(app);
    const tripId = await makeLinkedTrip(token);

    const response = await app.inject({
      method: "PUT",
      url: `/api/trips/${tripId}`,
      cookies: { auth_token: token },
      payload: { placeProvider: null, placeId: null },
    });
    expect(response.statusCode).toBe(200);
    const [row] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    expect(row?.placeProvider).toBeNull();
    expect(row?.placeId).toBeNull();
    expect(row?.placeName).toBeNull();
    expect(row?.placeAddress).toBeNull();
  });
});
