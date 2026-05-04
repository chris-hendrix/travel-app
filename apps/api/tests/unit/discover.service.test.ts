import { describe, it, expect, beforeEach, vi } from "vitest";
import { DiscoverService } from "@/services/discover.service.js";
import type { POISuggestion, POICategoryKey } from "@journiful/shared/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TRIP_ID = "trip-1111-2222-3333";

function makeSuggestion(overrides: Partial<POISuggestion> = {}): POISuggestion {
  return {
    sourceId: "fsq-001",
    name: "Test Place",
    address: "123 Test St",
    lat: 48.8566,
    lon: 2.3522,
    distance: 500,
    category: "food_and_drink" as POICategoryKey,
    popularity: null,
    price: null,
    rating: null,
    eventId: null,
    ...overrides,
  };
}

function makeFsqResult(overrides: Record<string, unknown> = {}) {
  return {
    fsq_place_id: "fsq-mock-001",
    name: "Mock Place",
    latitude: 48.857,
    longitude: 2.353,
    distance: 400,
    location: { formatted_address: "456 Mock Ave" },
    categories: [{ name: "Restaurant" }],
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
    service = new DiscoverService(mockDb as never, "test-fsq-key", mockLog as never);

    // Mock global fetch
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [makeFsqResult()] }),
    });
    global.fetch = fetchSpy;
  });

  // ── 1. Returns cached data without calling Foursquare ──────────────────────

  describe("cached data", () => {
    it("returns cached data without calling Foursquare when cache exists", async () => {
      const poi1 = makeSuggestion({ sourceId: "fsq-1", name: "Cafe One" });
      const poi2 = makeSuggestion({ sourceId: "fsq-2", name: "Bar Two", category: "nightlife" });

      // Trip query
      mockDb.where.mockResolvedValueOnce([
        {
          destination: "Paris",
          destinationLat: 48.8566,
          destinationLon: 2.3522,
          destinationDisplayName: "Paris, France",
        },
      ]);
      // Cache query
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "foursquare",
          searchLat: 48.8566,
          searchLon: 2.3522,
          searchLocation: "Paris, France",
          cachedAt: new Date(),
          suggestions: [poi1, poi2],
        },
      ]);

      const result = await service.getDiscoverPOIs(TRIP_ID);

      expect(result.destination).toBe("Paris, France");
      expect(result.source).toBe("foursquare");
      expect(result.categories.food_and_drink).toHaveLength(1);
      expect(result.categories.food_and_drink[0]!.name).toBe("Cafe One");
      expect(result.categories.nightlife).toHaveLength(1);
      expect(result.categories.nightlife[0]!.name).toBe("Bar Two");

      // Foursquare should NOT be called
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("filters out converted POIs (eventId != null)", async () => {
      const unconverted = makeSuggestion({ sourceId: "fsq-u1", name: "Unconverted Place" });
      const converted = makeSuggestion({
        sourceId: "fsq-c1",
        name: "Already Converted",
        eventId: "event-999",
      });

      mockDb.where.mockResolvedValueOnce([
        {
          destination: "Paris",
          destinationLat: 48.8566,
          destinationLon: 2.3522,
          destinationDisplayName: "Paris",
        },
      ]);
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "foursquare",
          searchLat: 48.8566,
          searchLon: 2.3522,
          searchLocation: "Paris",
          cachedAt: new Date(),
          suggestions: [unconverted, converted],
        },
      ]);

      const result = await service.getDiscoverPOIs(TRIP_ID);

      // Only the unconverted POI should appear
      expect(result.categories.food_and_drink).toHaveLength(1);
      expect(result.categories.food_and_drink[0]!.name).toBe("Unconverted Place");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ── 2. Fetches from Foursquare on first load ───────────────────────────────

  describe("Foursquare fetch", () => {
    it("fetches from Foursquare on first load (no cache)", async () => {
      // Trip query
      mockDb.where.mockResolvedValueOnce([
        {
          destination: "Paris",
          destinationLat: 48.8566,
          destinationLon: 2.3522,
          destinationDisplayName: "Paris",
        },
      ]);
      // No cache
      mockDb.where.mockResolvedValueOnce([]);
      // fetchAndCache: existing cache is also empty
      mockDb.where.mockResolvedValueOnce([]);

      const result = await service.getDiscoverPOIs(TRIP_ID);

      expect(result.source).toBe("foursquare");
      expect(fetchSpy).toHaveBeenCalledTimes(4); // 4 category calls

      // Should have inserted cache
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
    });

    it("re-fetches on refresh=true", async () => {
      // Trip query
      mockDb.where.mockResolvedValueOnce([
        {
          destination: "Paris",
          destinationLat: 48.8566,
          destinationLon: 2.3522,
          destinationDisplayName: "Paris",
        },
      ]);
      // fetchAndCache: existing cache contains converted POI
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "foursquare",
          searchLat: 48.8566,
          searchLon: 2.3522,
          searchLocation: "Paris",
          cachedAt: new Date(),
          suggestions: [
            makeSuggestion({ sourceId: "fsq-converted", name: "Converted", eventId: "evt-1" }),
          ],
        },
      ]);
      // fetchAndCache: insert succeeds
      mockDb.onConflictDoUpdate.mockResolvedValueOnce(undefined);

      const result = await service.getDiscoverPOIs(TRIP_ID, true);

      expect(result.source).toBe("foursquare");
      // Should fetch from Foursquare (refresh bypasses cache read)
      expect(fetchSpy).toHaveBeenCalledTimes(4);
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
    });

    it("preserves converted POIs on refresh", async () => {
      // Trip query
      mockDb.where.mockResolvedValueOnce([
        {
          destination: "Paris",
          destinationLat: 48.8566,
          destinationLon: 2.3522,
          destinationDisplayName: "Paris",
        },
      ]);
      // fetchAndCache: existing cache with converted POI
      const converted = makeSuggestion({
        sourceId: "fsq-converted",
        name: "Louvre",
        eventId: "evt-louvre",
      });
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "foursquare",
          searchLat: 48.8566,
          searchLon: 2.3522,
          searchLocation: "Paris",
          cachedAt: new Date(),
          suggestions: [converted],
        },
      ]);
      mockDb.onConflictDoUpdate.mockResolvedValueOnce(undefined);

      const result = await service.getDiscoverPOIs(TRIP_ID, true);

      expect(result.source).toBe("foursquare");
      expect(fetchSpy).toHaveBeenCalledTimes(4);

      // Insert call should include the converted POI
      const insertedValue = mockDb.values.mock.calls[0]?.[0] as { suggestions: POISuggestion[] };
      expect(insertedValue.suggestions).toBeDefined();
      const preserved = insertedValue.suggestions.find(
        (s: POISuggestion) => s.sourceId === "fsq-converted",
      );
      expect(preserved).toBeDefined();
      expect(preserved!.eventId).toBe("evt-louvre");
    });
  });

  // ── 3. Error handling ──────────────────────────────────────────────────────

  describe("error handling", () => {
    it("handles partial Foursquare failure (some categories fail)", async () => {
      mockDb.where.mockResolvedValueOnce([
        {
          destination: "Paris",
          destinationLat: 48.8566,
          destinationLon: 2.3522,
          destinationDisplayName: "Paris",
        },
      ]);
      mockDb.where.mockResolvedValueOnce([]);
      mockDb.where.mockResolvedValueOnce([]);
      mockDb.onConflictDoUpdate.mockResolvedValueOnce(undefined);

      // First 2 categories succeed, last 2 fail
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [
              makeFsqResult({ fsq_place_id: "fsq-food-1", name: "Bistro" }),
              makeFsqResult({ fsq_place_id: "fsq-food-2", name: "Pizzeria" }),
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [
              makeFsqResult({ fsq_place_id: "fsq-arts-1", name: "Gallery" }),
            ],
          }),
        })
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await service.getDiscoverPOIs(TRIP_ID);

      expect(result.source).toBe("foursquare");
      expect(result.partial).toBe(true);
      expect(result.errors).toBeDefined();
      expect(Object.keys(result.errors!)).toContain("outdoors");
      expect(Object.keys(result.errors!)).toContain("nightlife");
      // Categories that succeeded should have results
      expect(result.categories.food_and_drink.length).toBeGreaterThan(0);
      expect(result.categories.arts_and_entertainment.length).toBeGreaterThan(0);
    });

    it("handles all Foursquare calls failing", async () => {
      mockDb.where.mockResolvedValueOnce([
        {
          destination: "Paris",
          destinationLat: 48.8566,
          destinationLon: 2.3522,
          destinationDisplayName: "Paris",
        },
      ]);
      mockDb.where.mockResolvedValueOnce([]);
      mockDb.where.mockResolvedValueOnce([]);

      // All 4 fetch calls fail
      fetchSpy.mockResolvedValue({ ok: false, status: 500 });

      const result = await service.getDiscoverPOIs(TRIP_ID);

      // Categories should be empty
      expect(result.categories.food_and_drink).toHaveLength(0);
      expect(result.categories.arts_and_entertainment).toHaveLength(0);
      expect(result.categories.outdoors).toHaveLength(0);
      expect(result.categories.nightlife).toHaveLength(0);
      // Should not have inserted since all empty
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  // ── 4. Edge cases ──────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("returns empty for missing destination coords", async () => {
      // Trip with no lat/lon
      mockDb.where.mockResolvedValueOnce([
        {
          destination: null,
          destinationLat: null,
          destinationLon: null,
          destinationDisplayName: null,
        },
      ]);

      const result = await service.getDiscoverPOIs(TRIP_ID);

      expect(result.categories.food_and_drink).toHaveLength(0);
      expect(result.categories.arts_and_entertainment).toHaveLength(0);
      expect(result.categories.outdoors).toHaveLength(0);
      expect(result.categories.nightlife).toHaveLength(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("auto-refreshes when destination coords change (stale cache)", async () => {
      // Trip query — NEW destination coords (London)
      mockDb.where.mockResolvedValueOnce([
        {
          destination: "London",
          destinationLat: 51.5074,
          destinationLon: -0.1278,
          destinationDisplayName: "London, UK",
        },
      ]);
      // Cache query — OLD coords (Paris)
      const oldSuggestion = makeSuggestion({
        sourceId: "fsq-old",
        name: "Old Paris Cafe",
      });
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "foursquare",
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
          source: "foursquare",
          searchLat: 48.8566,
          searchLon: 2.3522,
          searchLocation: "Paris, France",
          cachedAt: new Date(),
          suggestions: [oldSuggestion],
        },
      ]);
      mockDb.onConflictDoUpdate.mockResolvedValueOnce(undefined);

      // Foursquare responds with London places
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            makeFsqResult({ fsq_place_id: "fsq-london-1", name: "London Cafe" }),
          ],
        }),
      });

      const result = await service.getDiscoverPOIs(TRIP_ID);

      // Should have detected stale cache (Paris → London) and re-fetched
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
      // Trip query — slightly different coords but within epsilon
      mockDb.where.mockResolvedValueOnce([
        {
          destination: "Paris",
          destinationLat: 48.8567, // 0.0001 diff
          destinationLon: 2.3523, // 0.0001 diff
          destinationDisplayName: "Paris, France",
        },
      ]);
      // Cache query
      mockDb.where.mockResolvedValueOnce([
        {
          tripId: TRIP_ID,
          source: "foursquare",
          searchLat: 48.8566,
          searchLon: 2.3522,
          searchLocation: "Paris, France",
          cachedAt: new Date(),
          suggestions: [makeSuggestion({ name: "Cafe" })],
        },
      ]);

      const result = await service.getDiscoverPOIs(TRIP_ID);

      // Should use cached data, not re-fetch
      expect(result.destination).toBe("Paris, France");
      expect(result.categories.food_and_drink).toHaveLength(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
