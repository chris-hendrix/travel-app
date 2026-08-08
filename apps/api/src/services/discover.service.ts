import { eq, sql } from "drizzle-orm";
import { trips, poiCache } from "@/db/schema/index.js";
import { POI_CATEGORIES, googleTypeLabels } from "@journiful/shared/types";
import type { POISuggestion, POICategoryKey, POISuggestionsResponse } from "@journiful/shared/types";
import type { AppDatabase } from "@/types/index.js";
import type { FastifyBaseLogger } from "fastify";

export interface IDiscoverService {
  getDiscoverPOIs(tripId: string, lat: number, lon: number, location: string | null, refresh?: boolean): Promise<POISuggestionsResponse>;
  convertPOI(tripId: string, sourceId: string, eventId: string): Promise<void>;
}

const GOOGLE_PLACES_BASE = "https://places.googleapis.com/v1/places:searchNearby";
const GOOGLE_MAX_RESULTS = 20;
const GOOGLE_RADIUS = 50000;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days per Google ToS

// Generic Google types to filter before category matching
const GENERIC_GOOGLE_TYPES = new Set([
  "establishment", "point_of_interest", "food", "store",
  "sublocality", "political", "geocode",
]);

type GooglePlace = {
  id: string;
  displayName: { text: string; languageCode: string };
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  types: string[];
};

type GoogleSearchNearbyResponse = { places: GooglePlace[] };

export class DiscoverService implements IDiscoverService {
  constructor(
    private readonly db: AppDatabase,
    private readonly googleApiKey: string,
    private readonly log: FastifyBaseLogger,
  ) {}

  async getDiscoverPOIs(tripId: string, lat: number, lon: number, location: string | null, refresh = false): Promise<POISuggestionsResponse> {
    // 1. Verify trip exists
    const [trip] = await this.db
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.id, tripId));

    if (!trip) {
      return emptyResponse(null);
    }

    // 2. If no coordinates provided, return empty
    if (lat == null || lon == null) {
      return emptyResponse(location);
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

        // Stale cache detection: if destination coords changed, treat as cache miss
        const DEST_COORD_EPSILON = 0.001; // ~111 meters
        if (
          Math.abs(row.searchLat - lat) > DEST_COORD_EPSILON ||
          Math.abs(row.searchLon - lon) > DEST_COORD_EPSILON
        ) {
          this.log.info(
            {
              tripId,
              oldLat: row.searchLat,
              oldLon: row.searchLon,
              newLat: lat,
              newLon: lon,
            },
            "Destination changed, refreshing POI cache",
          );
          if (this.googleApiKey) {
            return this.fetchAndCache(tripId, location, lat, lon);
          }
          this.log.warn(
            { tripId },
            "Destination changed but no API key configured, serving stale cache",
          );
          const unconverted = suggestions.filter((s) => s.eventId == null);
          return groupByCategory(unconverted, location);
        }

        // 30-day TTL: if cache is too old, re-fetch per Google ToS
        const cacheAge = Date.now() - row.cachedAt.getTime();
        if (cacheAge > CACHE_MAX_AGE_MS) {
          if (this.googleApiKey) {
            return this.fetchAndCache(tripId, location, lat, lon);
          }
          this.log.warn(
            { tripId, cacheAge },
            "POI cache expired but no API key configured, serving stale",
          );
        }

        // Filter out converted POIs
        const unconverted = suggestions.filter((s) => s.eventId == null);
        return groupByCategory(unconverted, location);
      }
    }

    // 4. Fetch from Google Places
    return this.fetchAndCache(tripId, location, lat, lon);
  }

  private async fetchAndCache(
    tripId: string,
    searchLocation: string | null,
    lat: number,
    lon: number,
  ): Promise<POISuggestionsResponse> {
    // Guard: API key is required to call Google Places
    if (!this.googleApiKey) {
      throw new Error(
        "Google API key is not configured. Set GOOGLE_MAPS_API_KEY environment variable.",
      );
    }

    // Read existing converted POIs
    const existing = await this.db
      .select()
      .from(poiCache)
      .where(eq(poiCache.tripId, tripId));

    const convertedSourceIds = new Set<string>();
    const preExistingConverted: POISuggestion[] = [];

    if (existing.length > 0) {
      const existingSuggestions = existing[0]!.suggestions as POISuggestion[];
      for (const s of existingSuggestions) {
        if (s.eventId != null) {
          convertedSourceIds.add(s.sourceId);
          preExistingConverted.push(s);
        }
      }
    }

    // 4 parallel Google Places searchNearby POST calls
    const categoryResults = await Promise.all(
      POI_CATEGORIES.map(async (cat) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const body = JSON.stringify({
            locationRestriction: {
              circle: {
                center: { latitude: lat, longitude: lon },
                radius: GOOGLE_RADIUS,
              },
            },
            includedTypes: cat.googleTypes,
            maxResultCount: GOOGLE_MAX_RESULTS,
            rankPreference: "POPULARITY",
          });

          const resp = await fetch(GOOGLE_PLACES_BASE, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": this.googleApiKey,
              "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types",
            },
            body,
          });
          clearTimeout(timeout);

          if (!resp.ok) {
            this.log.warn({ category: cat.id, status: resp.status }, "Google Places category fetch failed");
            return { category: cat.id, results: [] as POISuggestion[] };
          }

          const data = (await resp.json()) as GoogleSearchNearbyResponse;
          const results = (data.places ?? []).map(this.mapGoogleToSuggestion(cat.id, lat, lon));
          return { category: cat.id, results };
        } catch (err) {
          clearTimeout(timeout);
          this.log.warn({ category: cat.id, err }, "Google Places category fetch error");
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
        source: "google",
        categories: groupByCategoryOnly([]),
        partial: true,
        errors,
      };
    }

    // Build new blob: fresh (filtered) + existing converted
    let newBlob = [...allFresh, ...preExistingConverted];
    const hasErrors = Object.keys(errors).length > 0;

    // Re-read to catch conversions that happened during Google Places fetches (0.5–5s window)
    if (!allEmpty) {
      const latest = await this.db
        .select()
        .from(poiCache)
        .where(eq(poiCache.tripId, tripId));
      if (latest.length > 0) {
        const latestSuggestions = latest[0]!.suggestions as POISuggestion[];
        const latestConverted = latestSuggestions.filter((s) => s.eventId != null);
        const latestConvertedIds = new Set(latestConverted.map((s) => s.sourceId));
        // Rebuild: fresh results (excluding now-converted) + latest conversions
        newBlob = [
          ...allFresh.filter((r) => !latestConvertedIds.has(r.sourceId)),
          ...latestConverted,
        ];
      }
    }

    // Upsert cache
    await this.db
      .insert(poiCache)
      .values({
        tripId,
        source: "google",
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
      source: "google",
      categories: groupByCategoryOnly(allFresh),
      ...(hasErrors ? { partial: true, errors } : {}),
    };
  }

  async convertPOI(tripId: string, sourceId: string, eventId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('poi_convert_' || ${tripId}))`,
      );

      const rows = await tx
        .select()
        .from(poiCache)
        .where(eq(poiCache.tripId, tripId));

      if (rows.length === 0) return;

      const suggestions = rows[0]!.suggestions as POISuggestion[];
      const updated = suggestions.map((s) =>
        s.sourceId === sourceId ? { ...s, eventId } : s,
      );

      await tx
        .update(poiCache)
        .set({ suggestions: updated })
        .where(eq(poiCache.tripId, tripId));
    });
  }

  private mapGoogleToSuggestion(category: POICategoryKey, centerLat: number, centerLon: number) {
    return (p: GooglePlace): POISuggestion => {
      // Filter out generic types that aren't useful for categorization
      const meaningfulTypes = p.types.filter((t) => !GENERIC_GOOGLE_TYPES.has(t));

      // Match against this category's googleTypes (first match wins)
      const catConfig = POI_CATEGORIES.find((c) => c.id === category)!;
      const matchedType = meaningfulTypes.find((t) => catConfig.googleTypes.includes(t)) ?? meaningfulTypes[0] ?? null;

      // Compute distance with haversine formula
      const R = 6371000; // Earth radius in meters
      const dLat = (p.location.latitude - centerLat) * Math.PI / 180;
      const dLon = (p.location.longitude - centerLon) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos(centerLat * Math.PI / 180)
        * Math.cos(p.location.latitude * Math.PI / 180)
        * Math.sin(dLon / 2) ** 2;
      const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return {
        sourceId: p.id,
        name: p.displayName.text,
        address: p.formattedAddress ?? null,
        lat: p.location.latitude,
        lon: p.location.longitude,
        distance,
        category,
        popularity: null,
        price: null,
        rating: null,
        website: null,
        tel: null,
        subcategory: matchedType ? (googleTypeLabels[matchedType] ?? matchedType) : null,
        eventId: null,
      };
    };
  }
}

// Helpers
function emptyResponse(destination: string | null): POISuggestionsResponse {
  return {
    destination,
    source: "google",
    categories: groupByCategoryOnly([]),
  };
}

function groupByCategory(suggestions: POISuggestion[], destination: string | null): POISuggestionsResponse {
  return {
    destination,
    source: "google",
    categories: groupByCategoryOnly(suggestions),
  };
}

export function groupByCategoryOnly(suggestions: POISuggestion[]): Record<POICategoryKey, POISuggestion[]> {
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
