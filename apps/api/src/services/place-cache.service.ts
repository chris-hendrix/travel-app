import { and, eq, inArray, sql } from "drizzle-orm";
import { placeCache } from "@/db/schema/index.js";
import type {
  CachedPlaceDetails,
  PlaceSummary,
} from "@journiful/shared/types";
import type { AppDatabase } from "@/types/index.js";
import type { Logger } from "@/types/logger.js";

/** 30-day TTL on Google place content (Google permits caching for 30 days). */
export const PLACE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How many distinct cache misses a single list read refreshes inline.
 * The remainder resolve to null and fill in on later reads. A plain
 * exported constant so code and test cannot drift.
 */
export const PLACE_INLINE_REFRESH_CAP = 3;

/** Mirrors the `schema_version` column; bump to invalidate every cached row. */
export const PLACE_CACHE_SCHEMA_VERSION = 1;

export type PlacePair = {
  provider: string;
  placeId: string;
};

/** Resolves one place's normalized details, or null when unavailable. */
export type PlaceFetcher = (
  provider: string,
  placeId: string,
) => Promise<CachedPlaceDetails | null>;

/** `list` caps inline refreshes; `detail` awaits its one miss. */
export type PlaceResolveMode = "list" | "detail";

export interface ResolveManyOptions {
  mode?: PlaceResolveMode;
}

/** Map key for a (provider, placeId) pair. */
export function placeKey(pair: PlacePair): string {
  return `${pair.provider}:${pair.placeId}`;
}

function toSummary(placeId: string, details: CachedPlaceDetails): PlaceSummary {
  const photo = details.photos[0];
  return {
    placeId,
    name: details.name,
    address: details.address,
    photoUrl: photo
      ? `/api/locations/photos/${encodeURIComponent(photo.ref)}`
      : null,
    photoAttribution:
      photo && photo.authorName
        ? {
            name: photo.authorName,
            uri: photo.authorUri,
            photoUri: photo.authorPhotoUri,
          }
        : null,
    photoSourceUri: photo?.mapsUri ?? null,
    country: details.country,
  };
}

/**
 * PlaceCacheService — TTL-on-read cache over `place_cache`.
 *
 * - `resolve()` serves fresh (<=30d, current schema version) rows without
 *   touching the provider; misses delegate to the injected fetcher and are
 *   upserted in place. A failed fetch resolves to null (never throws), so a
 *   cold cache with Google unreachable degrades to the stored text.
 * - `resolveMany()` batches: one `SELECT … WHERE provider = ? AND
 *   place_id IN (…)` per provider in the set (the composite PK leads with
 *   `provider`, so a bare `place_id IN (…)` cannot use it), and an empty
 *   input short-circuits to an empty map with no statement at all.
 * - Inline refresh is bounded and fully awaited inside the requesting call:
 *   list mode fetches at most the first `PLACE_INLINE_REFRESH_CAP` distinct
 *   misses and returns null for the rest; detail mode awaits its one miss.
 *   There is no queue, no `setImmediate`, and no unawaited promise.
 */
export class PlaceCacheService {
  private readonly inFlight = new Map<
    string,
    Promise<CachedPlaceDetails | null>
  >();

  constructor(
    private readonly database: AppDatabase,
    private readonly fetcher: PlaceFetcher = async () => null,
    private readonly logger?: Logger,
  ) {}

  private isFresh(fetchedAt: Date, schemaVersion: number): boolean {
    return (
      schemaVersion === PLACE_CACHE_SCHEMA_VERSION &&
      Date.now() - fetchedAt.getTime() < PLACE_CACHE_TTL_MS
    );
  }

  private async fetchAndStore(
    provider: string,
    placeId: string,
  ): Promise<CachedPlaceDetails | null> {
    const key = `${provider}:${placeId}`;
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }
    const pending = (async (): Promise<CachedPlaceDetails | null> => {
      let details: CachedPlaceDetails | null;
      try {
        details = await this.fetcher(provider, placeId);
      } catch (err) {
        this.logger?.warn(
          { err, provider, placeId },
          "Place details fetch failed, resolving null",
        );
        return null;
      }
      if (!details) {
        return null;
      }
      await this.database
        .insert(placeCache)
        .values({
          provider,
          placeId,
          schemaVersion: PLACE_CACHE_SCHEMA_VERSION,
          details,
          fetchedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [placeCache.provider, placeCache.placeId],
          set: {
            schemaVersion: PLACE_CACHE_SCHEMA_VERSION,
            details,
            fetchedAt: new Date(),
          },
        });
      return details;
    })();
    const tracked = pending.finally(() => {
      if (this.inFlight.get(key) === tracked) {
        this.inFlight.delete(key);
      }
    });
    this.inFlight.set(key, tracked);
    return tracked;
  }

  /** Detail read: serves fresh rows, awaits the one miss inline. */
  async resolve(
    provider: string,
    placeId: string,
  ): Promise<PlaceSummary | null> {
    const map = await this.resolveMany(
      [{ provider, placeId }],
      { mode: "detail" },
    );
    return map.get(`${provider}:${placeId}`) ?? null;
  }

  async resolveMany(
    pairs: PlacePair[],
    opts: ResolveManyOptions = {},
  ): Promise<Map<string, PlaceSummary | null>> {
    const mode: PlaceResolveMode = opts.mode ?? "list";

    // Deduplicate to distinct (provider, placeId) before touching the DB,
    // so rows sharing a place refresh once and consume one cap slot.
    const distinct = new Map<string, PlacePair>();
    for (const pair of pairs) {
      distinct.set(placeKey(pair), pair);
    }
    // An empty set issues no statement at all rather than a degenerate one.
    if (distinct.size === 0) {
      return new Map();
    }

    // Group by provider: one statement per provider, always naming the
    // provider in its predicate (the composite PK leads with it).
    const byProvider = new Map<string, string[]>();
    for (const pair of distinct.values()) {
      const ids = byProvider.get(pair.provider);
      if (ids) {
        ids.push(pair.placeId);
      } else {
        byProvider.set(pair.provider, [pair.placeId]);
      }
    }

    const result = new Map<string, PlaceSummary | null>();
    const misses: PlacePair[] = [];
    for (const [provider, ids] of byProvider) {
      const rows = await this.database
        .select()
        .from(placeCache)
        .where(
          and(
            eq(placeCache.provider, provider),
            inArray(placeCache.placeId, ids),
          ),
        );
      const byId = new Map(rows.map((row) => [row.placeId, row]));
      for (const placeId of ids) {
        const row = byId.get(placeId);
        if (row && this.isFresh(row.fetchedAt, row.schemaVersion)) {
          result.set(
            `${provider}:${placeId}`,
            toSummary(placeId, row.details),
          );
        } else {
          misses.push({ provider, placeId });
        }
      }
    }

    // Bounded inline refresh, fully awaited inside this call. List mode
    // takes at most the first PLACE_INLINE_REFRESH_CAP distinct misses;
    // detail mode takes its (single) miss. The rest resolve to null.
    const toRefresh =
      mode === "list" ? misses.slice(0, PLACE_INLINE_REFRESH_CAP) : misses;
    const refreshed = await Promise.all(
      toRefresh.map(async (pair) => {
        const details = await this.fetchAndStore(pair.provider, pair.placeId);
        return { pair, details };
      }),
    );
    for (const { pair, details } of refreshed) {
      result.set(
        placeKey(pair),
        details ? toSummary(pair.placeId, details) : null,
      );
    }
    if (mode === "list") {
      for (const pair of misses.slice(PLACE_INLINE_REFRESH_CAP)) {
        result.set(placeKey(pair), null);
      }
    }
    return result;
  }

  /**
   * Deletes rows older than `maxAgeMs` and rows written under an older
   * schema version (invalidated, never migrated).
   * @returns number of rows deleted.
   */
  async purgeOlderThan(
    maxAgeMs: number = PLACE_CACHE_TTL_MS,
    now: Date = new Date(),
  ): Promise<number> {
    return purgeExpiredPlaceCache(this.database, maxAgeMs, now);
  }
}

/**
 * Standalone purge used by the queue cron (`queues/index.ts`) and by
 * service tests: `purgeExpiredPlaceCache(db)`.
 */
export async function purgeExpiredPlaceCache(
  database: AppDatabase,
  maxAgeMs: number = PLACE_CACHE_TTL_MS,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - maxAgeMs);
  const result = await database.execute(sql`
    DELETE FROM place_cache
    WHERE fetched_at < ${cutoff} OR schema_version < ${PLACE_CACHE_SCHEMA_VERSION}
  `);
  return result.rowCount ?? 0;
}
