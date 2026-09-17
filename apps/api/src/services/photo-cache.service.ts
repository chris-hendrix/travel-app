import type { IStorageService } from "@/services/storage.service.js";

/** Prefix under which cached Place photo blobs are stored. */
export const PHOTO_CACHE_PREFIX = "places-photos/";

export interface PhotoBlob {
  buffer: Buffer;
  contentType: string;
}

export type PhotoFetcher = () => Promise<PhotoBlob>;

/**
 * Builds an S3-safe cache key for a Place photo.
 * Each photoRef segment is URI-encoded so slashes remain delimiters
 * while spaces/special chars stay key-safe.
 */
export function buildPhotoCacheKey(
  photoRef: string,
  width: number,
  height: number,
): string {
  const encoded = photoRef
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${PHOTO_CACHE_PREFIX}${encoded}/${width}x${height}`;
}

/**
 * PhotoCacheService — storage-backed cache for Google Place photo blobs.
 *
 * - `getOrFetch` serves from storage on hit; on miss it deduplicates
 *   concurrent fetches for the same key via an in-flight promise map,
 *   persists the fetched bytes, and returns them.
 * - `purgeOlderThan` deletes cached blobs older than `maxAgeMs`
 *   (TTL enforcement for Google's 30-day photo-cache rule).
 */
export class PhotoCacheService {
  private readonly inFlight = new Map<string, Promise<PhotoBlob>>();

  constructor(private readonly storage: IStorageService) {}

  async getOrFetch(key: string, fetcher: PhotoFetcher): Promise<PhotoBlob> {
    const cached = await this.storage.getObjectBuffer(key);
    if (cached) {
      return cached;
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const pending = (async (): Promise<PhotoBlob> => {
      const fresh = await fetcher();
      await this.storage.putObject(key, fresh.buffer, fresh.contentType);
      return fresh;
    })();
    // Attach cleanup without creating an unhandled rejection: `finally`
    // on the derived promise still settles with the original outcome.
    const tracked = pending.finally(() => {
      if (this.inFlight.get(key) === tracked) {
        this.inFlight.delete(key);
      }
    });
    this.inFlight.set(key, tracked);
    return tracked;
  }

  /**
   * Deletes cached photo blobs older than `maxAgeMs`.
   * @returns the deleted keys.
   */
  async purgeOlderThan(maxAgeMs: number, now: Date = new Date()): Promise<string[]> {
    return purgeOlderThan(this.storage, maxAgeMs, now);
  }
}

/**
 * Standalone purge used by the queue cron (`queues/index.ts`):
 * `purgeOlderThan(storage, maxAgeMs)`.
 */
export async function purgeOlderThan(
  storage: Pick<IStorageService, "listKeys" | "statObject" | "deleteObject">,
  maxAgeMs: number,
  now: Date = new Date(),
): Promise<string[]> {
  const cutoff = now.getTime() - maxAgeMs;
  const keys = await storage.listKeys(PHOTO_CACHE_PREFIX);
  const deleted: string[] = [];
  for (const key of keys) {
    const stat = await storage.statObject(key);
    if (!stat) {
      continue;
    }
    if (stat.lastModified.getTime() < cutoff) {
      await storage.deleteObject(key);
      deleted.push(key);
    }
  }
  return deleted;
}
