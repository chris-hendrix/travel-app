import { createHash } from "node:crypto";
import type { IStorageService } from "@/services/storage.service.js";
import type { Logger } from "@/types/logger.js";

/** Prefix under which cached Place photo blobs are stored. */
export const PHOTO_CACHE_PREFIX = "places-photos/";

/** Content type marking a negatively-cached (tombstone) photo entry. */
export const TOMBSTONE_CONTENT_TYPE = "application/x-photo-missing";

/** How long a tombstone suppresses Google retries. Transient Google outages self-heal within the TTL. */
export const PHOTO_NEGATIVE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class PhotoNotCachedError extends Error {
  constructor(key: string) {
    super(`Photo not cached (tombstone): ${key}`);
    this.name = "PhotoNotCachedError";
  }
}

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

  constructor(
    private readonly storage: IStorageService,
    private readonly log?: Logger,
  ) {}

  async getOrFetch(key: string, fetcher: PhotoFetcher): Promise<PhotoBlob> {
    const cached = await this.storage.getObjectBuffer(key);
    if (cached) {
      if (cached.contentType === TOMBSTONE_CONTENT_TYPE) {
        const stat = await this.storage.statObject(key);
        if (
          stat &&
          Date.now() - stat.lastModified.getTime() < PHOTO_NEGATIVE_TTL_MS
        ) {
          throw new PhotoNotCachedError(key);
        }
        try {
          await this.storage.deleteObject(key);
        } catch (err) {
          // S3 deletes can fail transiently — don't let that turn the
          // recoverable retry path into a hard error.
          this.log?.warn(
            { err, key },
            "Photo tombstone delete failed, retrying fetch anyway",
          );
        }
      } else {
        return cached;
      }
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const pending = (async (): Promise<PhotoBlob> => {
      let fresh: PhotoBlob;
      try {
        fresh = await fetcher();
      } catch (err) {
        try {
          await this.storage.putObject(
            key,
            Buffer.alloc(0),
            TOMBSTONE_CONTENT_TYPE,
          );
        } catch (tombstoneErr) {
          this.log?.warn(
            { err: tombstoneErr, key },
            "Photo tombstone persist failed",
          );
        }
        throw err;
      }
      try {
        await this.storage.putObject(key, fresh.buffer, fresh.contentType);
      } catch (err) {
        this.log?.warn(
          { err, key },
          "Photo cache persist failed, serving unpersisted bytes",
        );
      }
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
