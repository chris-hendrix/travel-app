import type { PlaceSummary } from "@journiful/shared/types";
import type {
  PlaceCacheService,
  PlaceResolveMode,
} from "./place-cache.service.js";

type PlacePairColumns = {
  placeProvider: string | null;
  placeId: string | null;
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
      (row) => row.placeProvider != null && row.placeId != null,
    )
    .map((row) => ({
      provider: row.placeProvider as string,
      placeId: row.placeId as string,
    }));
  let resolved: Map<string, PlaceSummary | null>;
  try {
    resolved =
      pairs.length > 0
        ? await placeCache.resolveMany(pairs, { mode })
        : new Map();
  } catch (err) {
    // A `resolveMany` throw is the DB SELECT failing, not a Google
    // miss — log it so DB-down stays distinguishable from Google-miss
    // before degrading every row to null.
    console.warn(err, "attachPlaces: place resolve failed, attaching null");
    resolved = new Map();
  }
  return rows.map((row) => ({
    ...row,
    place:
      row.placeProvider != null && row.placeId != null
        ? (resolved.get(`${row.placeProvider}:${row.placeId}`) ?? null)
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
