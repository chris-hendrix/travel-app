import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { DiscoverService } from "@/services/discover.service.js";
import type { POISuggestion, POICategoryKey } from "@journiful/shared/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TRIP_ID = "trip-1111-2222-3333";

function makeSuggestion(overrides: Partial<POISuggestion> = {}): POISuggestion {
  return {
    sourceId: "ChIJ-mock-001",
    name: "Test Place",
    address: "123 Test St",
    lat: 48.8566,
    lon: 2.3522,
    distance: 500,
    category: "food_and_drink" as POICategoryKey,
    popularity: null,
    price: null,
    rating: null,
    website: null,
    tel: null,
    subcategory: null,
    eventId: null,
    ...overrides,
  };
}

function makeGooglePlace(overrides: Record<string, unknown> = {}) {
  return {
    id: "ChIJ-mock-001",
    displayName: { text: "Mock Place", languageCode: "en" },
    formattedAddress: "456 Mock Ave",
    location: { latitude: 48.857, longitude: 2.353 },
    types: ["restaurant", "food", "point_of_interest", "establishment"],
    ...overrides,
  };
}

// ─── Mock DB factory ─────────────────────────────────────────────────────────

interface MockDb {
  select: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
}

function createMockDb(): MockDb {
  const where = vi.fn().mockResolvedValue([]);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });
  return { select, from, where, insert, values, onConflictDoUpdate };
}

// ─── Mock logger ─────────────────────────────────────────────────────────────

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as ReturnType<typeof vi.fn>;
}

describe("DiscoverService", () => {
  let mockDb: MockDb;
  let mockLog: ReturnType<typeof createMockLogger>;
  let service: DiscoverService;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockLog = createMockLogger();
    service = new DiscoverService(mockDb as never, "test-google-key", mockLog as never);

    // Mock global fetch
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ places: [makeGooglePlace()] }),
    });
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Returns cached data without calling Google Places ───────────────────

  describe("cached data", () => {
    it("returns cached data without calling Google Places when cache exists", async () => {
      const poi1 = makeSuggestion({ sourceId: "ChIJ-1", name: "Cafe One" });
      const poi2 = makeSuggestion({ sourceId: "ChIJ-2", name: "Bar Two", category: "nightlife" });

      // Trip query
      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);
      // Cache query
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "google",
          searchLat: 48.8566,
          searchLon: 2.3522,
          searchLocation: "Paris, France",
          cachedAt: new Date(),
          suggestions: [poi1, poi2],
        },
      ]);

      const result = await service.getDiscoverPOIs(TRIP_ID, 48.8566, 2.3522, "Paris, France");

      expect(result.destination).toBe("Paris, France");
      expect(result.source).toBe("google");
      expect(result.categories.food_and_drink).toHaveLength(1);
      expect(result.categories.food_and_drink[0]!.name).toBe("Cafe One");
      expect(result.categories.nightlife).toHaveLength(1);
      expect(result.categories.nightlife[0]!.name).toBe("Bar Two");

      // Google Places should NOT be called
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("filters out converted POIs (eventId != null)", async () => {
      const unconverted = makeSuggestion({ sourceId: "ChIJ-u1", name: "Unconverted Place" });
      const converted = makeSuggestion({
        sourceId: "ChIJ-c1",
        name: "Already Converted",
        eventId: "event-999",
      });

      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "google",
          searchLat: 48.8566,
          searchLon: 2.3522,
          searchLocation: "Paris",
          cachedAt: new Date(),
          suggestions: [unconverted, converted],
        },
      ]);

      const result = await service.getDiscoverPOIs(TRIP_ID, 48.8566, 2.3522, "Paris");

      // Only the unconverted POI should appear
      expect(result.categories.food_and_drink).toHaveLength(1);
      expect(result.categories.food_and_drink[0]!.name).toBe("Unconverted Place");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("re-fetches when cache is older than 30 days (cache expiry)", async () => {
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
      const oldSuggestion = makeSuggestion({ sourceId: "ChIJ-old", name: "Old Place" });

      // Trip query
      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);
      // Cache query: has cache but it's 31 days old
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "google",
          searchLat: 48.8566,
          searchLon: 2.3522,
          searchLocation: "Paris",
          cachedAt: oldDate,
          suggestions: [oldSuggestion],
        },
      ]);
      // fetchAndCache: existing cache read (converted POIs)
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "google",
          searchLat: 48.8566,
          searchLon: 2.3522,
          searchLocation: "Paris",
          cachedAt: oldDate,
          suggestions: [oldSuggestion],
        },
      ]);
      mockDb.onConflictDoUpdate.mockResolvedValueOnce(undefined);

      const result = await service.getDiscoverPOIs(TRIP_ID, 48.8566, 2.3522, "Paris");

      expect(result.source).toBe("google");
      // Should have made 4 fetch calls (cache expired)
      expect(fetchSpy).toHaveBeenCalledTimes(4);
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
    });
  });

  // ── 2. Fetches from Google Places on first load ────────────────────────────

  describe("Google Places fetch", () => {
    it("fetches from Google Places on first load (no cache)", async () => {
      // Trip query
      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);
      // No cache
      mockDb.where.mockResolvedValueOnce([]);
      // fetchAndCache: existing cache is also empty
      mockDb.where.mockResolvedValueOnce([]);

      const result = await service.getDiscoverPOIs(TRIP_ID, 48.8566, 2.3522, "Paris");

      expect(result.source).toBe("google");
      expect(fetchSpy).toHaveBeenCalledTimes(4); // 4 category calls (POSTs to searchNearby)

      // Should have inserted cache
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();

      // Verify fetch was called with correct URL
      const fetchCalls = fetchSpy.mock.calls;
      for (const call of fetchCalls) {
        const url = call[0] as string;
        expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
        const opts = call[1] as { method?: string; headers?: Record<string, string> };
        expect(opts.method).toBe("POST");
        expect(opts.headers?.["X-Goog-Api-Key"]).toBe("test-google-key");
        expect(opts.headers?.["X-Goog-FieldMask"]).toBe(
          "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.attributions",
        );
      }
    });

    it("re-fetches on refresh=true", async () => {
      // Trip query
      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);
      // fetchAndCache: existing cache contains converted POI
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "google",
          searchLat: 48.8566,
          searchLon: 2.3522,
          searchLocation: "Paris",
          cachedAt: new Date(),
          suggestions: [
            makeSuggestion({ sourceId: "ChIJ-converted", name: "Converted", eventId: "evt-1" }),
          ],
        },
      ]);
      // fetchAndCache: insert succeeds
      mockDb.onConflictDoUpdate.mockResolvedValueOnce(undefined);

      const result = await service.getDiscoverPOIs(TRIP_ID, 48.8566, 2.3522, "Paris", true);

      expect(result.source).toBe("google");
      // Should fetch from Google Places (refresh bypasses cache read)
      expect(fetchSpy).toHaveBeenCalledTimes(4);
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
    });

    it("preserves converted POIs on refresh", async () => {
      // Trip query
      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);
      // fetchAndCache: existing cache with converted POI
      const converted = makeSuggestion({
        sourceId: "ChIJ-converted",
        name: "Louvre",
        eventId: "evt-louvre",
      });
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "google",
          searchLat: 48.8566,
          searchLon: 2.3522,
          searchLocation: "Paris",
          cachedAt: new Date(),
          suggestions: [converted],
        },
      ]);
      mockDb.onConflictDoUpdate.mockResolvedValueOnce(undefined);

      const result = await service.getDiscoverPOIs(TRIP_ID, 48.8566, 2.3522, "Paris", true);

      expect(result.source).toBe("google");
      expect(fetchSpy).toHaveBeenCalledTimes(4);

      // Insert call should include the converted POI
      const insertedValue = mockDb.values.mock.calls[0]?.[0] as { suggestions: POISuggestion[] };
      expect(insertedValue.suggestions).toBeDefined();
      const preserved = insertedValue.suggestions.find(
        (s: POISuggestion) => s.sourceId === "ChIJ-converted",
      );
      expect(preserved).toBeDefined();
      expect(preserved!.eventId).toBe("evt-louvre");
    });
  });

  // ── 3. Generic type filtering and subcategory labeling ─────────────────────

  describe("Google Places type mapping", () => {
    it("filters out generic Google types", async () => {
      // This tests mapGoogleToSuggestion behavior internally
      // Generic types (food, point_of_interest, establishment) should be filtered
      // leaving only "restaurant" as the meaningful type
      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);
      mockDb.where.mockResolvedValueOnce([]); // no cache
      mockDb.where.mockResolvedValueOnce([]); // fetchAndCache existing
      mockDb.onConflictDoUpdate.mockResolvedValueOnce(undefined);

      // Google place with generic types mixed in
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          places: [
            makeGooglePlace({
              id: "ChIJ-gen-test",
              displayName: { text: "Generic Test", languageCode: "en" },
              types: ["restaurant", "food", "point_of_interest", "establishment"],
            }),
          ],
        }),
      });

      const result = await service.getDiscoverPOIs(TRIP_ID, 48.8566, 2.3522, "Paris");

      // food_and_drink should have the restaurant since "restaurant" is in googleTypes for food_and_drink
      // The generic types (food, point_of_interest, establishment) are filtered out before matching
      expect(result.categories.food_and_drink.length).toBeGreaterThan(0);
      const poi = result.categories.food_and_drink[0]!;
      expect(poi.name).toBe("Generic Test");
    });

    it("uses googleTypeLabels for subcategory display name", async () => {
      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);
      mockDb.where.mockResolvedValueOnce([]); // no cache
      mockDb.where.mockResolvedValueOnce([]); // fetchAndCache existing
      mockDb.onConflictDoUpdate.mockResolvedValueOnce(undefined);

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          places: [
            makeGooglePlace({
              id: "ChIJ-label-test",
              displayName: { text: "Label Test", languageCode: "en" },
              types: ["restaurant", "point_of_interest", "establishment"],
            }),
          ],
        }),
      });

      const result = await service.getDiscoverPOIs(TRIP_ID, 48.8566, 2.3522, "Paris");

      const poi = result.categories.food_and_drink[0]!;
      // subcategory should be the human-friendly label "Restaurant", not the raw type "restaurant"
      expect(poi.subcategory).toBe("Restaurant");
    });
  });

  // ── 4. No API key ──────────────────────────────────────────────────────────

  describe("no API key", () => {
    it("throws when googleApiKey is empty string", async () => {
      const svc = new DiscoverService(mockDb as never, "", mockLog as never);

      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);
      mockDb.where.mockResolvedValueOnce([]); // no cache

      await expect(
        svc.getDiscoverPOIs(TRIP_ID, 48.8566, 2.3522, "Paris"),
      ).rejects.toThrow(/Google API key/i);
    });
  });

  // ── 5. Error handling ──────────────────────────────────────────────────────

  describe("Google Places error handling", () => {
    it("handles partial Google Places failure (some categories fail)", async () => {
      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);
      mockDb.where.mockResolvedValueOnce([]);
      mockDb.where.mockResolvedValueOnce([]);
      mockDb.onConflictDoUpdate.mockResolvedValueOnce(undefined);

      // First 2 categories succeed, last 2 fail
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            places: [
              makeGooglePlace({ id: "ChIJ-food-1", displayName: { text: "Bistro", languageCode: "en" } }),
              makeGooglePlace({ id: "ChIJ-food-2", displayName: { text: "Pizzeria", languageCode: "en" } }),
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            places: [
              makeGooglePlace({ id: "ChIJ-arts-1", displayName: { text: "Gallery", languageCode: "en" } }),
            ],
          }),
        })
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await service.getDiscoverPOIs(TRIP_ID, 48.8566, 2.3522, "Paris");

      expect(result.source).toBe("google");
      expect(result.partial).toBe(true);
      expect(result.errors).toBeDefined();
      expect(Object.keys(result.errors!)).toContain("outdoors");
      expect(Object.keys(result.errors!)).toContain("nightlife");
      // Categories that succeeded should have results
      expect(result.categories.food_and_drink.length).toBeGreaterThan(0);
      expect(result.categories.arts_and_entertainment.length).toBeGreaterThan(0);
    });

    it("handles all Google Places calls failing", async () => {
      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);
      mockDb.where.mockResolvedValueOnce([]);
      mockDb.where.mockResolvedValueOnce([]);

      // All 4 fetch calls fail
      fetchSpy.mockResolvedValue({ ok: false, status: 500 });

      const result = await service.getDiscoverPOIs(TRIP_ID, 48.8566, 2.3522, "Paris");

      // Categories should be empty
      expect(result.categories.food_and_drink).toHaveLength(0);
      expect(result.categories.arts_and_entertainment).toHaveLength(0);
      expect(result.categories.outdoors).toHaveLength(0);
      expect(result.categories.nightlife).toHaveLength(0);
      // Should not have inserted since all empty
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  // ── 6. Cross-category deduplication ────────────────────────────────────────

  describe("cross-category deduplication", () => {
    it("deduplicates POIs across categories by sourceId (first category wins)", async () => {
      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);
      mockDb.where.mockResolvedValueOnce([]); // no cache
      mockDb.where.mockResolvedValueOnce([]); // fetchAndCache existing
      mockDb.onConflictDoUpdate.mockResolvedValueOnce(undefined);

      // POI_CATEGORIES priority order: food → arts → outdoors → nightlife
      // Tourist attraction is in both arts_and_entertainment and outdoors googleTypes
      fetchSpy
        // Call 1: food_and_drink
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            places: [
              makeGooglePlace({
                id: "ChIJ-food-1",
                displayName: { text: "Bistro", languageCode: "en" },
              }),
            ],
          }),
        })
        // Call 2: arts_and_entertainment — returns tourist_attraction
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            places: [
              makeGooglePlace({
                id: "ChIJ-dup-001",
                displayName: { text: "Eiffel Tower", languageCode: "en" },
                types: ["tourist_attraction", "point_of_interest", "establishment"],
              }),
            ],
          }),
        })
        // Call 3: outdoors — same place duplicated
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            places: [
              makeGooglePlace({
                id: "ChIJ-dup-001",
                displayName: { text: "Eiffel Tower", languageCode: "en" },
                types: ["tourist_attraction", "point_of_interest", "establishment"],
              }),
            ],
          }),
        })
        // Call 4: nightlife
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            places: [
              makeGooglePlace({
                id: "ChIJ-night-1",
                displayName: { text: "Club XYZ", languageCode: "en" },
                types: ["night_club", "bar", "establishment"],
              }),
            ],
          }),
        });

      const result = await service.getDiscoverPOIs(TRIP_ID, 48.8566, 2.3522, "Paris");

      expect(result.source).toBe("google");

      // Duplicate should appear in arts_and_entertainment (first in priority order after food)
      const dupInArts = result.categories.arts_and_entertainment.find(
        (p: POISuggestion) => p.sourceId === "ChIJ-dup-001",
      );
      expect(dupInArts).toBeDefined();
      expect(dupInArts!.name).toBe("Eiffel Tower");
      expect(dupInArts!.category).toBe("arts_and_entertainment");

      // Duplicate should NOT appear in outdoors (second in priority)
      const dupInOutdoors = result.categories.outdoors.find(
        (p: POISuggestion) => p.sourceId === "ChIJ-dup-001",
      );
      expect(dupInOutdoors).toBeUndefined();

      // Other categories still have their results
      expect(result.categories.food_and_drink).toHaveLength(1);
      expect(result.categories.food_and_drink[0]!.name).toBe("Bistro");

      expect(result.categories.nightlife).toHaveLength(1);
      expect(result.categories.nightlife[0]!.name).toBe("Club XYZ");
    });
  });

  // ── 7. Edge cases ──────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("returns empty when lat/lon are not provided", async () => {
      // Trip exists
      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);

      const result = await service.getDiscoverPOIs(TRIP_ID, null as unknown as number, null as unknown as number, null);

      expect(result.categories.food_and_drink).toHaveLength(0);
      expect(result.categories.arts_and_entertainment).toHaveLength(0);
      expect(result.categories.outdoors).toHaveLength(0);
      expect(result.categories.nightlife).toHaveLength(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("auto-refreshes when passed coords differ from cache (stale cache)", async () => {
      // Trip exists
      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);
      // Cache query — OLD coords (Paris)
      const oldSuggestion = makeSuggestion({
        sourceId: "ChIJ-old",
        name: "Old Paris Cafe",
      });
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "google",
          searchLat: 48.8566, // Paris lat
          searchLon: 2.3522, // Paris lon
          searchLocation: "Paris, France",
          cachedAt: new Date(),
          suggestions: [oldSuggestion],
        },
      ]);
      // fetchAndCache: re-read existing cache (with converted POIs)
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "google",
          searchLat: 48.8566,
          searchLon: 2.3522,
          searchLocation: "Paris, France",
          cachedAt: new Date(),
          suggestions: [oldSuggestion],
        },
      ]);
      mockDb.onConflictDoUpdate.mockResolvedValueOnce(undefined);

      // Google responds with London places
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          places: [
            makeGooglePlace({ id: "ChIJ-london-1", displayName: { text: "London Cafe", languageCode: "en" } }),
          ],
        }),
      });

      const result = await service.getDiscoverPOIs(TRIP_ID, 51.5074, -0.1278, "London, UK");

      // Should have detected stale cache (Paris coords in cache → London coords passed) and re-fetched
      expect(result.destination).toBe("London, UK");
      expect(fetchSpy).toHaveBeenCalledTimes(4);
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.objectContaining({
          oldLat: 48.8566,
          oldLon: 2.3522,
          newLat: 51.5074,
          newLon: -0.1278,
        }),
        "Destination changed, refreshing POI cache",
      );

      // Insert should contain London coords
      const insertedValue = mockDb.values.mock.calls[0]?.[0] as { searchLat: number; searchLon: number };
      expect(insertedValue.searchLat).toBe(51.5074);
      expect(insertedValue.searchLon).toBe(-0.1278);
    });

    it("does not treat small coord diffs as stale (within epsilon)", async () => {
      // Trip exists
      mockDb.where.mockResolvedValueOnce([{ id: TRIP_ID }]);
      // Cache query — slightly different coords but within epsilon
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "google",
          searchLat: 48.8566,
          searchLon: 2.3522,
          searchLocation: "Paris, France",
          cachedAt: new Date(),
          suggestions: [makeSuggestion({ name: "Cafe" })],
        },
      ]);

      const result = await service.getDiscoverPOIs(TRIP_ID, 48.8567, 2.3523, "Paris, France");

      // Should use cached data, not re-fetch
      expect(result.destination).toBe("Paris, France");
      expect(result.categories.food_and_drink).toHaveLength(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
