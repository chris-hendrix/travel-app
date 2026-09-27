import type { PlaceSummary } from "@journiful/shared/types";
import type {
  PlaceCacheService,
  PlaceResolveMode,
} from "./place-cache.service.js";

type PlacePairColumns = {
  placeProvider: string | null;
  externalPlaceId: string | null;
};

/**
 * Attach `place: PlaceSummary | null` to rows carrying the durable place
 * pair. Rows without a pair resolve to null without touching the cache;
 * a resolve failure (Google unreachable, cold cache) degrades to null per
 * row and never throws, so the stored text column stays the fallback.
 */
export async function attachPlaces<T extends PlacePairColumns>(
  rows: readonly T[],
  placeCache: PlaceCacheService,
  mode: PlaceResolveMode,
): Promise<(T & { place: PlaceSummary | null })[]> {
  const pairs = rows
    .filter(
      (row) => row.placeProvider != null && row.externalPlaceId != null,
    )
    .map((row) => ({
      provider: row.placeProvider as string,
      placeId: row.externalPlaceId as string,
    }));
  let resolved: Map<string, PlaceSummary | null>;
  try {
    resolved =
      pairs.length > 0
        ? await placeCache.resolveMany(pairs, { mode })
        : new Map();
  } catch {
    resolved = new Map();
  }
  return rows.map((row) => ({
    ...row,
    place:
      row.placeProvider != null && row.externalPlaceId != null
        ? (resolved.get(`${row.placeProvider}:${row.externalPlaceId}`) ?? null)
        : null,
  }));
}

/** Single-row convenience over {@link attachPlaces}. */
export async function attachPlace<T extends PlacePairColumns>(
  row: T,
  placeCache: PlaceCacheService,
  mode: PlaceResolveMode,
): Promise<T & { place: PlaceSummary | null }> {
  const [attached] = await attachPlaces([row], placeCache, mode);
  return attached!;
}
