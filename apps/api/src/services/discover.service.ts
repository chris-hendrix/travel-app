import { eq } from "drizzle-orm";
import { trips, poiCache } from "@/db/schema/index.js";
import { POI_CATEGORIES } from "@journiful/shared/types";
import type { POISuggestion, POICategoryKey, POISuggestionsResponse } from "@journiful/shared/types";
import type { AppDatabase } from "@/types/index.js";
import type { FastifyBaseLogger } from "fastify";

export interface IDiscoverService {
  getDiscoverPOIs(tripId: string, refresh?: boolean): Promise<POISuggestionsResponse>;
  convertPOI(tripId: string, sourceId: string, eventId: string): Promise<void>;
}

const FOURSQUARE_BASE = "https://places-api.foursquare.com/places/search";
const FOURSQUARE_VERSION = "2025-06-17";
const RADIUS = 50000;
const LIMIT = 10;

// Foursquare search response types
type FsqPlace = {
  fsq_place_id: string;
  name: string;
  latitude: number;
  longitude: number;
  distance: number;
  location: { formatted_address?: string };
  categories: Array<{ name: string }>;
};

type FsqSearchResponse = { results: FsqPlace[]; context?: unknown };

export class DiscoverService implements IDiscoverService {
  constructor(
    private readonly db: AppDatabase,
    private readonly foursquareKey: string,
    private readonly log: FastifyBaseLogger,
  ) {}

  async getDiscoverPOIs(tripId: string, refresh = false): Promise<POISuggestionsResponse> {
    // 1. Read trip destination
    const [trip] = await this.db
      .select({
        destination: trips.destination,
        destinationLat: trips.destinationLat,
        destinationLon: trips.destinationLon,
        destinationDisplayName: trips.destinationDisplayName,
      })
      .from(trips)
      .where(eq(trips.id, tripId));

    if (!trip) {
      return emptyResponse(null);
    }

    // 2. Check if destination has coords
    const { destination, destinationLat, destinationLon, destinationDisplayName } = trip;
    if (destinationLat == null || destinationLon == null) {
      return emptyResponse(destinationDisplayName ?? destination ?? null);
    }

    // 3. Check cache
    if (!refresh) {
      const cached = await this.db
        .select()
        .from(poiCache)
        .where(eq(poiCache.tripId, tripId));

      if (cached.length > 0) {
        const row = cached[0]!;
        const suggestions = row.suggestions as POISuggestion[];
        // Filter out converted POIs
        const unconverted = suggestions.filter((s) => s.eventId == null);
        return groupByCategory(unconverted, destinationDisplayName ?? destination ?? null);
      }
    }

    // 4. Fetch from Foursquare
    return this.fetchAndCache(
      tripId,
      destinationDisplayName ?? destination ?? null,
      destinationLat,
      destinationLon,
    );
  }

  private async fetchAndCache(
    tripId: string,
    searchLocation: string | null,
    lat: number,
    lon: number,
  ): Promise<POISuggestionsResponse> {
    // Read existing converted POIs
    const existing = await this.db
      .select()
      .from(poiCache)
      .where(eq(poiCache.tripId, tripId));

    const convertedSourceIds = new Set<string>();
    let existingConverted: POISuggestion[] = [];

    if (existing.length > 0) {
      const existingSuggestions = existing[0]!.suggestions as POISuggestion[];
      for (const s of existingSuggestions) {
        if (s.eventId != null) {
          convertedSourceIds.add(s.sourceId);
          existingConverted.push(s);
        }
      }
    }

    // 4 parallel Foursquare calls
    const categoryResults = await Promise.all(
      POI_CATEGORIES.map(async (cat) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);

          const url = `${FOURSQUARE_BASE}?ll=${lat},${lon}&radius=${RADIUS}&fsq_category_ids=${cat.fsqCategoryIds}&sort=POPULARITY&limit=${LIMIT}`;
          const resp = await fetch(url, {
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${this.foursquareKey}`,
              "X-Places-Api-Version": FOURSQUARE_VERSION,
              Accept: "application/json",
            },
          });
          clearTimeout(timeout);

          if (!resp.ok) {
            this.log.warn({ category: cat.id, status: resp.status }, "Foursquare category fetch failed");
            return { category: cat.id, results: [] as POISuggestion[] };
          }

          const data = (await resp.json()) as FsqSearchResponse;
          const results = (data.results ?? []).map(this.mapFsqToSuggestion(cat.id));
          return { category: cat.id, results };
        } catch (err) {
          this.log.warn({ category: cat.id, err }, "Foursquare category fetch error");
          return { category: cat.id, results: [] as POISuggestion[] };
        }
      }),
    );

    // Collect all results, check for partial failure
    const errors: Record<string, string> = {};
    let allEmpty = true;
    const allFresh: POISuggestion[] = [];

    for (const { category, results } of categoryResults) {
      if (results.length === 0) {
        errors[category] = "No results or fetch failed";
      } else {
        allEmpty = false;
      }
      // Filter out already-converted POIs
      const filtered = results.filter((r) => !convertedSourceIds.has(r.sourceId));
      allFresh.push(...filtered);
    }

    if (allEmpty && Object.keys(errors).length === POI_CATEGORIES.length) {
      return {
        destination: searchLocation,
        source: "foursquare",
        categories: {} as Record<POICategoryKey, POISuggestion[]>,
        partial: true,
        errors,
      };
    }

    // Build new blob: fresh (filtered) + existing converted
    const newBlob = [...allFresh, ...existingConverted];
    const hasErrors = Object.keys(errors).length > 0;

    // Upsert cache
    await this.db
      .insert(poiCache)
      .values({
        tripId,
        source: "foursquare",
        searchLat: lat,
        searchLon: lon,
        searchLocation,
        cachedAt: new Date(),
        suggestions: newBlob,
      })
      .onConflictDoUpdate({
        target: poiCache.tripId,
        set: {
          suggestions: newBlob,
          searchLat: lat,
          searchLon: lon,
          searchLocation,
          cachedAt: new Date(),
        },
      });

    // Return unconverted fresh results
    return {
      destination: searchLocation,
      source: "foursquare",
      categories: groupByCategoryOnly(allFresh),
      ...(hasErrors ? { partial: true, errors } : {}),
    };
  }

  async convertPOI(tripId: string, sourceId: string, eventId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(poiCache)
      .where(eq(poiCache.tripId, tripId));

    if (rows.length === 0) return;

    const suggestions = rows[0]!.suggestions as POISuggestion[];
    const updated = suggestions.map((s) =>
      s.sourceId === sourceId ? { ...s, eventId } : s,
    );

    await this.db
      .update(poiCache)
      .set({ suggestions: updated })
      .where(eq(poiCache.tripId, tripId));
  }

  private mapFsqToSuggestion(category: POICategoryKey) {
    return (p: FsqPlace): POISuggestion => ({
      sourceId: p.fsq_place_id,
      name: p.name,
      address: p.location?.formatted_address ?? null,
      lat: p.latitude,
      lon: p.longitude,
      distance: p.distance,
      category,
      popularity: null,
      price: null,
      rating: null,
      eventId: null,
    });
  }
}

// Helpers
function emptyResponse(destination: string | null): POISuggestionsResponse {
  return {
    destination,
    source: "foursquare",
    categories: {} as Record<POICategoryKey, POISuggestion[]>,
  };
}

function groupByCategory(suggestions: POISuggestion[], destination: string | null): POISuggestionsResponse {
  return {
    destination,
    source: "foursquare",
    categories: groupByCategoryOnly(suggestions),
  };
}

function groupByCategoryOnly(suggestions: POISuggestion[]): Record<POICategoryKey, POISuggestion[]> {
  const categories = {} as Record<POICategoryKey, POISuggestion[]>;
  for (const cat of POI_CATEGORIES) {
    categories[cat.id] = [];
  }
  for (const s of suggestions) {
    if (categories[s.category]) {
      categories[s.category].push(s);
    }
  }
  return categories;
}
