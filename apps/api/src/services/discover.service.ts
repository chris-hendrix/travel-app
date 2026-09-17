import { and, eq, isNull } from "drizzle-orm";
import { trips, poiCache, poiConversions, events } from "@/db/schema/index.js";
import { POI_CATEGORIES, googleTypeLabels } from "@journiful/shared/types";
import type { POISuggestion, POICategoryKey, POISuggestionsResponse } from "@journiful/shared/types";
import { poiSuggestionSchema } from "@journiful/shared/schemas";
import { z } from "zod";
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

/**
 * Round coordinates to 2 decimal places (≈1.1 km cells at the equator).
 * Single source of truth for cache-cell precision: all poi_cache lookups
 * key on roundCoords output, never raw coords.
 */
export function roundCoords(lat: number, lon: number): { lat: number; lon: number } {
  return {
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
  };
}

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
  attributions?: string[];
  photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string; photoUri?: string }[]; widthPx: number; heightPx: number }[];
  businessStatus?: string;
  googleMapsUri?: string;
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

    // 3. Check global coords cache (rounded cell, shared across trips)
    const cell = roundCoords(lat, lon);
    const cellFilter = and(eq(poiCache.lat, cell.lat), eq(poiCache.lon, cell.lon));
    if (!refresh) {
      const cached = await this.db.select().from(poiCache).where(cellFilter);

      if (cached.length > 0) {
        const row = cached[0]!;
        let suggestions = row.suggestions as POISuggestion[];

        // Validate cached blob against current schema — stale blobs (e.g. pre
        // photo/background fields from commit dbc997ae) fail serialization and
        // 500 the response. Detect here and self-heal instead.
        const validation = z.array(poiSuggestionSchema).safeParse(suggestions);
        if (!validation.success) {
          if (this.googleApiKey) {
            this.log.info(
              { tripId, issues: validation.error.issues.slice(0, 3) },
              "Stale POI cache schema, invalidating and refetching",
            );
            await this.db.delete(poiCache).where(cellFilter);
            return this.fetchAndCache(tripId, location, lat, lon);
          }
          // No API key — can't refetch, normalize missing fields to null so
          // the response still passes Zod serialization (degraded but not 500).
          this.log.warn({ tripId }, "Stale POI cache schema but no API key, serving normalized cache");
          suggestions = suggestions.map(normalizeSuggestion);
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

        // Filter out converted POIs via the per-trip overlay, ignoring
        // conversions whose event was soft-deleted (deleted_at IS NULL).
        // The cache blob is global and immutable — never mutated here.
        const converted = await this.getActiveConvertedSourceIds(tripId);
        const unconverted = suggestions.filter((s) => !converted.has(s.sourceId));
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

    const cell = roundCoords(lat, lon);
    const attributionSet = new Set<string>();

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
            // Match on the place's single primary type so multi-type places
            // (Walmart: department_store + bakery; hotels: lodging + bar/gym)
            // don't bleed into unrelated categories via secondary types.
            includedPrimaryTypes: cat.googleTypes,
            maxResultCount: GOOGLE_MAX_RESULTS,
            rankPreference: "POPULARITY",
          });

          const resp = await fetch(GOOGLE_PLACES_BASE, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": this.googleApiKey,
              "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.attributions,places.photos,places.businessStatus,places.googleMapsUri",
            },
            body,
          });
          clearTimeout(timeout);

          if (!resp.ok) {
            this.log.warn({ category: cat.id, status: resp.status }, "Google Places category fetch failed");
            return { category: cat.id, results: [] as POISuggestion[] };
          }

          const data = (await resp.json()) as GoogleSearchNearbyResponse;

          if (data.places) {
            for (const place of data.places) {
              if (place.attributions) {
                for (const attr of place.attributions) attributionSet.add(attr);
              }
            }
          }

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
    const seenSourceIds = new Set<string>();

    for (const { category, results } of categoryResults) {
      if (results.length === 0) {
        errors[category] = "No results or fetch failed";
      } else {
        allEmpty = false;
      }
      // Filter out cross-category duplicates (first category wins).
      // Converted POIs are NOT filtered from the blob here — the blob is
      // global and immutable; the per-trip overlay is applied at read time.
      const filtered = results.filter((r) => {
        if (seenSourceIds.has(r.sourceId)) return false;
        seenSourceIds.add(r.sourceId);
        return true;
      });
      allFresh.push(...filtered);
    }

    if (allEmpty && Object.keys(errors).length === POI_CATEGORIES.length) {
      return {
        destination: searchLocation,
        source: "google",
        categories: groupByCategoryOnly([]),
        partial: true,
        errors,
        attributions: [],
      };
    }

    // Build new blob: fresh results only. Conversions live in the
    // poi_conversions overlay, so no re-read/rebuild window is needed —
    // a conversion landing mid-fetch is picked up by the overlay read below.
    const newBlob = [...allFresh];
    const hasErrors = Object.keys(errors).length > 0;

    // Upsert global coords cell
    await this.db
      .insert(poiCache)
      .values({
        lat: cell.lat,
        lon: cell.lon,
        source: "google",
        location: searchLocation,
        cachedAt: new Date(),
        suggestions: newBlob,
      })
      .onConflictDoUpdate({
        target: [poiCache.lat, poiCache.lon],
        set: {
          suggestions: newBlob,
          location: searchLocation,
          cachedAt: new Date(),
        },
      });

    // Return fresh results minus this trip's active conversions (read after
    // the upsert so conversions landing mid-fetch are still honored).
    const converted = await this.getActiveConvertedSourceIds(tripId);
    const visible = allFresh.filter((r) => !converted.has(r.sourceId));
    return {
      destination: searchLocation,
      source: "google",
      categories: groupByCategoryOnly(visible),
      attributions: [...attributionSet],
      ...(hasErrors ? { partial: true, errors } : {}),
    };
  }

  /**
   * Source IDs converted in this trip whose linked event is NOT soft-deleted.
   * The LEFT JOIN + `deleted_at IS NULL` filter is the authoritative
   * mechanism: events soft-delete, so FK cascade never fires in app flows.
   */
  private async getActiveConvertedSourceIds(tripId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ sourceId: poiConversions.sourceId })
      .from(poiConversions)
      .leftJoin(events, eq(poiConversions.eventId, events.id))
      .where(and(eq(poiConversions.tripId, tripId), isNull(events.deletedAt)));
    return new Set(rows.map((r) => r.sourceId));
  }

  // Overlay upsert: conversions leave the global cache blob untouched.
  // Per-trip isolation + soft-delete filtering happen at read time.
  async convertPOI(tripId: string, sourceId: string, eventId: string): Promise<void> {
    await this.db
      .insert(poiConversions)
      .values({ tripId, sourceId, eventId })
      .onConflictDoUpdate({
        target: [poiConversions.tripId, poiConversions.sourceId],
        set: { eventId },
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
        photoName: p.photos?.[0]?.name ?? null,
        photoAttribution: p.photos?.[0]?.authorAttributions?.[0]?.displayName ?? null,
        googleMapsUri: p.googleMapsUri ?? null,
        businessStatus: p.businessStatus ?? null,
      };
    };
  }
}

// Normalize a possibly-stale cached POI (pre-dbc997ae blobs lack photo fields)
function normalizeSuggestion(s: POISuggestion): POISuggestion {
  const raw = s as unknown as Record<string, unknown>;
  return {
    ...s,
    photoName: (raw.photoName as string | null | undefined) ?? null,
    photoAttribution: (raw.photoAttribution as string | null | undefined) ?? null,
    googleMapsUri: (raw.googleMapsUri as string | null | undefined) ?? null,
    businessStatus: (raw.businessStatus as string | null | undefined) ?? null,
  };
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
  // Sort each category by distance ascending (nearest first)
  for (const cat of POI_CATEGORIES) {
    categories[cat.id].sort((a, b) => a.distance - b.distance);
  }
  return categories;
}
