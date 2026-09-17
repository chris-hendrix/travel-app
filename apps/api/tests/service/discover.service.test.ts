import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/config/database.js";
import { trips, users, members, events, poiCache, poiConversions } from "@/db/schema/index.js";
import { DiscoverService, roundCoords } from "@/services/discover.service.js";
import { EventService } from "@/services/event.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { POI_CATEGORIES } from "@journiful/shared/types";
import { generateUniquePhone } from "../test-utils.js";

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as never;

function makeGooglePayload(idSeed: string) {
  return {
    places: [
      {
        id: `ChIJ-${idSeed}`,
        displayName: { text: `Place ${idSeed}`, languageCode: "en" },
        formattedAddress: "1 Test St",
        location: { latitude: 47.6062, longitude: -122.3321 },
        types: ["restaurant", "point_of_interest", "establishment"],
      },
    ],
  };
}

describe("discover.service coords cache (Task 3.2)", () => {
  let userId: string;
  let tripId: string;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let service: DiscoverService;
  const cells: { lat: number; lon: number }[] = [];

  const trackCell = (lat: number, lon: number) => {
    const c = roundCoords(lat, lon);
    if (!cells.some((x) => x.lat === c.lat && x.lon === c.lon)) cells.push(c);
    return c;
  };

  beforeEach(async () => {
    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: "Discover Cache User",
        timezone: "UTC",
      })
      .returning();
    userId = user.id;
    const [trip] = await db
      .insert(trips)
      .values({
        name: "Cache Trip",
        destination: "Seattle, USA",
        preferredTimezone: "America/Los_Angeles",
        createdBy: userId,
      })
      .returning();
    tripId = trip.id;

    let n = 0;
    fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => makeGooglePayload(`p${n++}`),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    service = new DiscoverService(db, "test-google-key", log);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    for (const c of cells.splice(0)) {
      await db
        .delete(poiCache)
        .where(and(eq(poiCache.lat, c.lat), eq(poiCache.lon, c.lon)));
    }
    if (tripId) {
      await db.delete(trips).where(eq(trips.id, tripId));
    }
    if (userId) {
      await db.delete(users).where(eq(users.id, userId));
    }
    vi.clearAllMocks();
  });

  it("(a) two queries in the same rounded cell share one row + one fanout", async () => {
    const base = { lat: 47.6062, lon: -122.3321 };
    // ~400m north: 0.0036° lat ≈ 400m — stays inside the same 2dp cell
    const near = { lat: base.lat + 0.0036, lon: base.lon };
    expect(roundCoords(near.lat, near.lon)).toEqual(roundCoords(base.lat, base.lon));
    trackCell(base.lat, base.lon);

    await service.getDiscoverPOIs(tripId, base.lat, base.lon, "Seattle");
    const afterFirst = fetchSpy.mock.calls.length;
    expect(afterFirst).toBe(POI_CATEGORIES.length);

    await service.getDiscoverPOIs(tripId, near.lat, near.lon, "Seattle");
    // No new Google calls — served from the shared cell row
    expect(fetchSpy.mock.calls.length).toBe(afterFirst);

    const rows = await db.select().from(poiCache);
    const cell = roundCoords(base.lat, base.lon);
    const matching = rows.filter((r) => r.lat === cell.lat && r.lon === cell.lon);
    expect(matching).toHaveLength(1);
  });

  it("(b) a query in a different cell creates a separate row + new fanout", async () => {
    const base = { lat: 47.6062, lon: -122.3321 };
    // ~1.2km north: 0.011° lat ≈ 1.2km — crosses into the next 2dp cell
    const far = { lat: base.lat + 0.011, lon: base.lon };
    expect(roundCoords(far.lat, far.lon)).not.toEqual(roundCoords(base.lat, base.lon));
    trackCell(base.lat, base.lon);
    trackCell(far.lat, far.lon);

    await service.getDiscoverPOIs(tripId, base.lat, base.lon, "Seattle");
    const afterFirst = fetchSpy.mock.calls.length;

    await service.getDiscoverPOIs(tripId, far.lat, far.lon, "Seattle");
    expect(fetchSpy.mock.calls.length).toBe(afterFirst + POI_CATEGORIES.length);

    const cellA = roundCoords(base.lat, base.lon);
    const cellB = roundCoords(far.lat, far.lon);
    const rowA = await db
      .select()
      .from(poiCache)
      .where(and(eq(poiCache.lat, cellA.lat), eq(poiCache.lon, cellA.lon)));
    const rowB = await db
      .select()
      .from(poiCache)
      .where(and(eq(poiCache.lat, cellB.lat), eq(poiCache.lon, cellB.lon)));
    expect(rowA).toHaveLength(1);
    expect(rowB).toHaveLength(1);
  });

  it("(c) repeat hit within 30d makes zero Google calls", async () => {
    const coords = { lat: 47.6062, lon: -122.3321 };
    trackCell(coords.lat, coords.lon);
    await service.getDiscoverPOIs(tripId, coords.lat, coords.lon, "Seattle");
    fetchSpy.mockClear();
    const result = await service.getDiscoverPOIs(tripId, coords.lat, coords.lon, "Seattle");
    expect(fetchSpy).not.toHaveBeenCalled();
    const total = Object.values(result.categories).flat().length;
    expect(total).toBeGreaterThan(0);
  });

  it("(d) refresh=true refetches and upserts the same cell", async () => {
    const coords = { lat: 47.6062, lon: -122.3321 };
    const cell = trackCell(coords.lat, coords.lon);
    await service.getDiscoverPOIs(tripId, coords.lat, coords.lon, "Seattle");
    fetchSpy.mockClear();
    await service.getDiscoverPOIs(tripId, coords.lat, coords.lon, "Seattle", true);
    expect(fetchSpy.mock.calls.length).toBe(POI_CATEGORIES.length);
    const rows = await db
      .select()
      .from(poiCache)
      .where(and(eq(poiCache.lat, cell.lat), eq(poiCache.lon, cell.lon)));
    expect(rows).toHaveLength(1);
  });

  it("(e) legacy blob fails Zod, row is deleted, and cache self-heals via refetch", async () => {
    const coords = { lat: 47.6062, lon: -122.3321 };
    const cell = trackCell(coords.lat, coords.lon);
    // Seed a valid row first so we have a well-formed suggestion to strip.
    await service.getDiscoverPOIs(tripId, coords.lat, coords.lon, "Seattle");
    const [seeded] = await db
      .select()
      .from(poiCache)
      .where(and(eq(poiCache.lat, cell.lat), eq(poiCache.lon, cell.lon)));
    expect(seeded).toBeDefined();
    const [valid] = seeded!.suggestions as Record<string, unknown>[];
    // Pre-dbc997ae-style blob: photo fields did not exist yet.
    const { photoName, photoAttribution, googleMapsUri, businessStatus, ...legacy } = valid!;
    void photoName;
    void photoAttribution;
    void googleMapsUri;
    void businessStatus;
    await db
      .update(poiCache)
      .set({ suggestions: sql`${JSON.stringify([legacy])}::jsonb` })
      .where(and(eq(poiCache.lat, cell.lat), eq(poiCache.lon, cell.lon)));

    fetchSpy.mockClear();
    const result = await service.getDiscoverPOIs(tripId, coords.lat, coords.lon, "Seattle");
    // Self-heal: stale row deleted + refetched from Google.
    expect(fetchSpy.mock.calls.length).toBe(POI_CATEGORIES.length);
    const total = Object.values(result.categories).flat().length;
    expect(total).toBeGreaterThan(0);
    // Healed row now validates (all suggestions carry the photo fields).
    const [healed] = await db
      .select()
      .from(poiCache)
      .where(and(eq(poiCache.lat, cell.lat), eq(poiCache.lon, cell.lon)));
    expect(healed).toBeDefined();
    for (const s of healed!.suggestions as Record<string, unknown>[]) {
      expect(s).toHaveProperty("photoName");
      expect(s).toHaveProperty("googleMapsUri");
    }
  });
});

describe("discover.service conversion overlay (Task 3.3)", () => {
  const permissionsService = new PermissionsService(db);
  const eventService = new EventService(db, permissionsService);

  let userId: string;
  let tripAId: string;
  let tripBId: string;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let service: DiscoverService;
  // Distinct cell (NYC) so rows never collide with the Task 3.2 block (Seattle).
  const coords = { lat: 40.7128, lon: -74.006 };
  const cell = roundCoords(coords.lat, coords.lon);
  let n = 0;

  const allSourceIds = (result: Awaited<ReturnType<DiscoverService["getDiscoverPOIs"]>>) =>
    Object.values(result.categories).flat().map((s) => s.sourceId);

  async function createEventFor(tripId: string, creatorId: string) {
    const [event] = await db
      .insert(events)
      .values({
        tripId,
        createdBy: creatorId,
        name: "Converted POI Event",
        eventType: "food_and_drink",
        startTime: new Date(),
      })
      .returning();
    return event!;
  }

  beforeEach(async () => {
    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: "Overlay User",
        timezone: "UTC",
      })
      .returning();
    userId = user.id;
    const [tripA] = await db
      .insert(trips)
      .values({
        name: "Overlay Trip A",
        destination: "New York, USA",
        preferredTimezone: "America/New_York",
        createdBy: userId,
      })
      .returning();
    tripAId = tripA.id;
    const [tripB] = await db
      .insert(trips)
      .values({
        name: "Overlay Trip B",
        destination: "New York, USA",
        preferredTimezone: "America/New_York",
        createdBy: userId,
      })
      .returning();
    tripBId = tripB.id;
    // Creator membership so the real EventService.deleteEvent path authorizes.
    await db.insert(members).values({ tripId: tripAId, userId, status: "going" });
    await db.insert(members).values({ tripId: tripBId, userId, status: "going" });

    n = 0;
    fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => makeGooglePayload(`overlay-${n++}`),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    service = new DiscoverService(db, "test-google-key", log);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.delete(poiConversions).where(eq(poiConversions.tripId, tripAId));
    await db.delete(poiConversions).where(eq(poiConversions.tripId, tripBId));
    await db.delete(events).where(eq(events.tripId, tripAId));
    await db.delete(events).where(eq(events.tripId, tripBId));
    await db
      .delete(poiCache)
      .where(and(eq(poiCache.lat, cell.lat), eq(poiCache.lon, cell.lon)));
    await db.delete(members).where(eq(members.tripId, tripAId));
    await db.delete(members).where(eq(members.tripId, tripBId));
    await db.delete(trips).where(eq(trips.id, tripAId));
    await db.delete(trips).where(eq(trips.id, tripBId));
    await db.delete(users).where(eq(users.id, userId));
    vi.clearAllMocks();
  });

  it("(a) convertPOI writes the overlay and leaves the cache blob byte-identical", async () => {
    const before = await service.getDiscoverPOIs(tripAId, coords.lat, coords.lon, "New York");
    const target = allSourceIds(before)[0]!;
    expect(target).toBeDefined();

    const [cachedBefore] = await db
      .select()
      .from(poiCache)
      .where(and(eq(poiCache.lat, cell.lat), eq(poiCache.lon, cell.lon)));
    const blobBefore = JSON.stringify(cachedBefore!.suggestions);

    const event = await createEventFor(tripAId, userId);
    await service.convertPOI(tripAId, target, event.id);

    // Overlay row recorded.
    const overlay = await db
      .select()
      .from(poiConversions)
      .where(and(eq(poiConversions.tripId, tripAId), eq(poiConversions.sourceId, target)));
    expect(overlay).toHaveLength(1);
    expect(overlay[0]!.eventId).toBe(event.id);

    // Blob untouched by the conversion.
    const [cachedAfter] = await db
      .select()
      .from(poiCache)
      .where(and(eq(poiCache.lat, cell.lat), eq(poiCache.lon, cell.lon)));
    expect(JSON.stringify(cachedAfter!.suggestions)).toBe(blobBefore);

    // Converted POI hidden from trip A's reads (served from cache, 0 Google calls).
    fetchSpy.mockClear();
    const after = await service.getDiscoverPOIs(tripAId, coords.lat, coords.lon, "New York");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(allSourceIds(after)).not.toContain(target);
  });

  it("(b) trip B sharing the cache row is unaffected by trip A's conversion", async () => {
    const first = await service.getDiscoverPOIs(tripAId, coords.lat, coords.lon, "New York");
    const target = allSourceIds(first)[0]!;
    const event = await createEventFor(tripAId, userId);
    await service.convertPOI(tripAId, target, event.id);

    fetchSpy.mockClear();
    const tripBResult = await service.getDiscoverPOIs(tripBId, coords.lat, coords.lon, "New York");
    // Same shared row, zero refetch...
    expect(fetchSpy).not.toHaveBeenCalled();
    // ...and trip B still sees the POI trip A converted.
    expect(allSourceIds(tripBResult)).toContain(target);
  });

  it("(c) soft-deleting the event via EventService returns the POI to trip A's results", async () => {
    const first = await service.getDiscoverPOIs(tripAId, coords.lat, coords.lon, "New York");
    const target = allSourceIds(first)[0]!;
    const event = await createEventFor(tripAId, userId);
    await service.convertPOI(tripAId, target, event.id);

    const hidden = await service.getDiscoverPOIs(tripAId, coords.lat, coords.lon, "New York");
    expect(allSourceIds(hidden)).not.toContain(target);

    // Real service path — sets deletedAt, keeps the overlay row.
    await eventService.deleteEvent(userId, event.id);
    const [deleted] = await db.select().from(events).where(eq(events.id, event.id));
    expect(deleted!.deletedAt).not.toBeNull();

    fetchSpy.mockClear();
    const restored = await service.getDiscoverPOIs(tripAId, coords.lat, coords.lon, "New York");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(allSourceIds(restored)).toContain(target);
  });
});
