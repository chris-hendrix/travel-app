import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, trips, members, events, placeCache } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";
import { PlaceCacheService } from "@/services/place-cache.service.js";
import type { CachedPlaceDetails } from "@journiful/shared/types";

function cachedDetails(name: string): CachedPlaceDetails {
  return {
    v: 1,
    name,
    address: `${name} address`,
    shortAddress: null,
    lat: 39.7,
    lon: 2.9,
    photos: [],
    country: "ES",
  };
}

async function setupUserAndTrip(app: FastifyInstance) {
  const [testUser] = await db
    .insert(users)
    .values({
      phoneNumber: generateUniquePhone(),
      displayName: "Place User",
      timezone: "UTC",
    })
    .returning();
  const [trip] = await db
    .insert(trips)
    .values({
      name: "Place Trip",
      destination: "Soller",
      preferredTimezone: "Europe/Madrid",
      createdBy: testUser!.id,
    })
    .returning();
  await db.insert(members).values({
    tripId: trip!.id,
    userId: testUser!.id,
    status: "going",
    isOrganizer: true,
  });
  const token = app.jwt.sign({ sub: testUser!.id, name: "Place User" });
  return { testUser: testUser!, trip: trip!, token };
}

/** Point app.placeCache at a counting stub fetcher. */
function stubPlaceCache(app: FastifyInstance, details: CachedPlaceDetails, counter: { calls: number }) {
  (app as unknown as Record<string, unknown>).placeCache =
    new PlaceCacheService(
      app.db,
      async () => {
        counter.calls += 1;
        return details;
      },
      app.log,
    );
}

function failingPlaceCache(app: FastifyInstance) {
  (app as unknown as Record<string, unknown>).placeCache =
    new PlaceCacheService(
      app.db,
      async () => {
        throw new Error("Google unreachable");
      },
      app.log,
    );
}

describe("Phase 5: place reaches the client", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("Task 1: creating an event with the pair stores both columns", async () => {
    app = await buildApp();
    const { trip, token } = await setupUserAndTrip(app);

    const response = await app.inject({
      method: "POST",
      url: `/api/trips/${trip.id}/events`,
      cookies: { auth_token: token },
      payload: {
        name: "La Bodega",
        eventType: "food_and_drink",
        startTime: "2026-09-19T14:00:00Z",
        location: "La Bodega",
        placeProvider: "google",
        placeId: "ChIJbodega1",
      },
    });

    expect(response.statusCode).toBe(201);
    const [row] = await db.select().from(events).where(eq(events.tripId, trip.id));
    expect(row!.placeProvider).toBe("google");
    expect(row!.placeId).toBe("ChIJbodega1");
  });

  it("Task 1: creating an event with only a provider is rejected, storing nothing", async () => {
    app = await buildApp();
    const { trip, token } = await setupUserAndTrip(app);

    const response = await app.inject({
      method: "POST",
      url: `/api/trips/${trip.id}/events`,
      cookies: { auth_token: token },
      payload: {
        name: "Half pair",
        eventType: "misc",
        startTime: "2026-09-19T14:00:00Z",
        placeProvider: "google",
      },
    });

    expect(response.statusCode).toBe(400);
    const rows = await db.select().from(events).where(eq(events.tripId, trip.id));
    expect(rows.length).toBe(0);
  });

  it("Task 2: updating with a different pair overwrites; nulls clear both", async () => {
    app = await buildApp();
    const { testUser, trip, token } = await setupUserAndTrip(app);
    const [created] = await db
      .insert(events)
      .values({
        tripId: trip.id,
        createdBy: testUser.id,
        name: "Dinner",
        eventType: "food_and_drink",
        location: "Old place",
        placeProvider: "google",
        placeId: "ChIJold",
        startTime: new Date("2026-09-19T14:00:00Z"),
      })
      .returning();

    const overwrite = await app.inject({
      method: "PUT",
      url: `/api/events/${created!.id}`,
      cookies: { auth_token: token },
      payload: { placeProvider: "google", placeId: "ChIJnew" },
    });
    expect(overwrite.statusCode).toBe(200);
    const [afterOverwrite] = await db.select().from(events).where(eq(events.id, created!.id));
    expect(afterOverwrite!.placeId).toBe("ChIJnew");

    const clear = await app.inject({
      method: "PUT",
      url: `/api/events/${created!.id}`,
      cookies: { auth_token: token },
      payload: { placeProvider: null, placeId: null },
    });
    expect(clear.statusCode).toBe(200);
    const [afterClear] = await db.select().from(events).where(eq(events.id, created!.id));
    expect(afterClear!.placeProvider).toBeNull();
    expect(afterClear!.placeId).toBeNull();
  });

  it("Task 3: list resolves place from cache with no provider fetch; pairless row is null", async () => {
    app = await buildApp();
    const counter = { calls: 0 };
    stubPlaceCache(app, cachedDetails("La Bodega"), counter);
    const { testUser, trip, token } = await setupUserAndTrip(app);

    const cachedId = `ChIJcached1${randomUUID()}`;
    await db.insert(placeCache).values({
      provider: "google",
      placeId: cachedId,
      schemaVersion: 1,
      details: cachedDetails("La Bodega"),
      fetchedAt: new Date(),
    });
    await db.insert(events).values([
      {
        tripId: trip.id,
        createdBy: testUser.id,
        name: "Dinner",
        eventType: "food_and_drink",
        location: "La Bodega",
        placeProvider: "google",
        placeId: cachedId,
        startTime: new Date("2026-09-19T14:00:00Z"),
      },
      {
        tripId: trip.id,
        createdBy: testUser.id,
        name: "Typed",
        eventType: "misc",
        location: "my own words",
        startTime: new Date("2026-09-19T15:00:00Z"),
      },
    ]);

    const response = await app.inject({
      method: "GET",
      url: `/api/trips/${trip.id}/events`,
      cookies: { auth_token: token },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(counter.calls).toBe(0);
    expect(body.events).toHaveLength(2);
    const withPlace = body.events.find((e: { name: string }) => e.name === "Dinner");
    expect(withPlace.place).toMatchObject({ placeId: cachedId, name: "La Bodega" });
    const typed = body.events.find((e: { name: string }) => e.name === "Typed");
    expect(typed.place).toBeNull();
  });

  it("Task 3: list caps inline refresh at PLACE_INLINE_REFRESH_CAP", async () => {
    app = await buildApp();
    const counter = { calls: 0 };
    stubPlaceCache(app, cachedDetails("Somewhere"), counter);
    const { testUser, trip, token } = await setupUserAndTrip(app);

    const runTag = randomUUID();
    const rows = Array.from({ length: 8 }, (_, i) => ({
      tripId: trip.id,
      createdBy: testUser.id,
      name: `E${i}`,
      eventType: "misc" as const,
      location: `Place ${i}`,
      placeProvider: "google",
      placeId: `ChIJmiss${runTag}${i}`,
      startTime: new Date("2026-09-19T14:00:00Z"),
    }));
    await db.insert(events).values(rows);

    const response = await app.inject({
      method: "GET",
      url: `/api/trips/${trip.id}/events`,
      cookies: { auth_token: token },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(counter.calls).toBe(3);
    const populated = body.events.filter((e: { place: unknown }) => e.place !== null);
    const nulled = body.events.filter((e: { place: unknown }) => e.place === null);
    expect(populated).toHaveLength(3);
    expect(nulled).toHaveLength(5);
  });

  it("Task 4: detail resolves a miss inline", async () => {
    app = await buildApp();
    const counter = { calls: 0 };
    stubPlaceCache(app, cachedDetails("Detail Place"), counter);
    const { testUser, trip, token } = await setupUserAndTrip(app);
    const [created] = await db
      .insert(events)
      .values({
        tripId: trip.id,
        createdBy: testUser.id,
        name: "Detail dinner",
        eventType: "food_and_drink",
        location: "Detail Place",
        placeProvider: "google",
        placeId: `ChIJdetail${randomUUID()}`,
        startTime: new Date("2026-09-19T14:00:00Z"),
      })
      .returning();

    const response = await app.inject({
      method: "GET",
      url: `/api/events/${created!.id}`,
      cookies: { auth_token: token },
    });
    expect(response.statusCode).toBe(200);
    expect(counter.calls).toBe(1);
    const body = JSON.parse(response.body);
    expect(body.event.place).toMatchObject({ name: "Detail Place" });
  });

  it("Task 5: Google unreachable still serves the row with place null", async () => {
    app = await buildApp();
    failingPlaceCache(app);
    const { testUser, trip, token } = await setupUserAndTrip(app);
    const [created] = await db
      .insert(events)
      .values({
        tripId: trip.id,
        createdBy: testUser.id,
        name: "Offline dinner",
        eventType: "misc",
        location: "my typed words",
        placeProvider: "google",
        placeId: `ChIJoffline${randomUUID()}`,
        startTime: new Date("2026-09-19T14:00:00Z"),
      })
      .returning();

    const response = await app.inject({
      method: "GET",
      url: `/api/events/${created!.id}`,
      cookies: { auth_token: token },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.event.place).toBeNull();
    expect(body.event.location).toBe("my typed words");
  });
});
