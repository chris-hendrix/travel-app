import { createHash } from "node:crypto";
import type { IStorageService } from "@/services/storage.service.js";

/** Prefix under which cached Place photo blobs are stored. */
export const PHOTO_CACHE_PREFIX = "places-photos/";

export interface PhotoBlob {
  buffer: Buffer;
  contentType: string;
}

export type PhotoFetcher = () => Promise<PhotoBlob>;

/**
 * Builds a storage-safe cache key for a Place photo.
 *
 * Google photo refs are routinely 400-800 chars as a single path segment.
 * Real S3 tolerates that (1024-byte total key limit), but S3-compatible
 * stores backed by a filesystem (MinIO local dev) enforce a ~255-byte
 * per-component filename limit and reject the key with
 * `XMinioInvalidObjectName`. Hashing keeps keys short and backend-agnostic.
 */
export function buildPhotoCacheKey(
  photoRef: string,
  width: number,
  height: number,
): string {
  const digest = createHash("sha256").update(photoRef).digest("hex");
  return `${PHOTO_CACHE_PREFIX}${digest}/${width}x${height}`;
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
