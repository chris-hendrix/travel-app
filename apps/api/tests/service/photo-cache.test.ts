import { mkdtempSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PhotoCacheService, buildPhotoCacheKey } from "@/services/photo-cache.service.js";
import { LocalStorageService } from "@/services/storage.service.js";

function makeCache() {
  const dir = mkdtempSync(join(tmpdir(), "photo-cache-test-"));
  const storage = new LocalStorageService(dir);
  const cache = new PhotoCacheService(storage);
  return { cache, storage, dir };
}

describe("PhotoCacheService", () => {
  it("builds short deterministic cache keys (sha256 — safe for filesystem-backed S3 stores)", () => {
    const a = buildPhotoCacheKey("places/abc/photos/ref 1", 400, 280);
    // 64-char hex digest + prefix + size: well under MinIO's per-component limit.
    expect(a).toMatch(/^places-photos\/[0-9a-f]{64}\/400x280$/);
    expect(a.length).toBeLessThan(100);
    // Deterministic and size-sensitive.
    expect(buildPhotoCacheKey("places/abc/photos/ref 1", 400, 280)).toBe(a);
    expect(buildPhotoCacheKey("places/abc/photos/ref 1", 600, 400)).not.toBe(a);
    expect(buildPhotoCacheKey("places/abc/photos/ref 2", 400, 280)).not.toBe(a);
  });

  it("deduplicates concurrent fetches for the same key", async () => {
    const { cache } = makeCache();
    const bytes = Buffer.from("image-bytes");
    const fetcher = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { buffer: bytes, contentType: "image/jpeg" };
    });

    const key = "places-photos/ref1/400x280";
    const [a, b] = await Promise.all([
      cache.getOrFetch(key, fetcher),
      cache.getOrFetch(key, fetcher),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(Buffer.compare(a.buffer, bytes)).toBe(0);
    expect(Buffer.compare(b.buffer, bytes)).toBe(0);
    expect(a.contentType).toBe("image/jpeg");
    expect(b.contentType).toBe("image/jpeg");
  });

  it("fetches different keys independently", async () => {
    const { cache } = makeCache();
    const fetcher = vi.fn(async (key: string) => ({
      buffer: Buffer.from(`bytes-for-${key}`),
      contentType: "image/jpeg",
    }));

    const a = await cache.getOrFetch("places-photos/a/100x100", () =>
      fetcher("places-photos/a/100x100"),
    );
    const b = await cache.getOrFetch("places-photos/b/100x100", () =>
      fetcher("places-photos/b/100x100"),
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(a.buffer.toString()).toBe("bytes-for-places-photos/a/100x100");
    expect(b.buffer.toString()).toBe("bytes-for-places-photos/b/100x100");
  });

  it("serves the second sequential request from storage without refetching", async () => {
    const { cache } = makeCache();
    const fetcher = vi.fn(async () => ({
      buffer: Buffer.from("cached"),
      contentType: "image/png",
    }));

    const key = "places-photos/seq/100x100";
    await cache.getOrFetch(key, fetcher);
    const hit = await cache.getOrFetch(key, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(hit.buffer.toString()).toBe("cached");
    expect(hit.contentType).toBe("image/png");
  });

  it("purgeOlderThan deletes stale objects and keeps fresh ones", async () => {
    const { cache, dir } = makeCache();
    const oldKey = "places-photos/old/100x100";
    const freshKey = "places-photos/fresh/100x100";
    await cache.getOrFetch(oldKey, async () => ({
      buffer: Buffer.from("old"),
      contentType: "image/jpeg",
    }));
    await cache.getOrFetch(freshKey, async () => ({
      buffer: Buffer.from("fresh"),
      contentType: "image/jpeg",
    }));

    // Fake mtime: old object 40 days ago, fresh object now.
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    utimesSync(resolve(dir, oldKey), fortyDaysAgo, fortyDaysAgo);

    const deleted = await cache.purgeOlderThan(30 * 24 * 60 * 60 * 1000);
    expect(deleted).toContain(oldKey);
    expect(deleted).not.toContain(freshKey);

    // Old key gone, fresh key still served from storage without fetching.
    const refetch = vi.fn(async () => ({
      buffer: Buffer.from("should-not-run"),
      contentType: "image/jpeg",
    }));
    const fresh = await cache.getOrFetch(freshKey, refetch);
    expect(refetch).not.toHaveBeenCalled();
    expect(fresh.buffer.toString()).toBe("fresh");
    await expect(
      cache.getOrFetch(oldKey, async () => ({
        buffer: Buffer.from("re-fetched"),
        contentType: "image/jpeg",
      })),
    ).resolves.toMatchObject({ contentType: "image/jpeg" });
  });

  it("serves fetched bytes even when persist fails", async () => {
    const { storage } = makeCache();
    const logger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as never;
    const cache = new PhotoCacheService(storage, logger);
    vi.spyOn(storage, "putObject").mockRejectedValueOnce(
      new Error("disk full"),
    );
    const bytes = Buffer.from("fresh-bytes");
    const fetcher = vi.fn(async () => ({
      buffer: bytes,
      contentType: "image/jpeg",
    }));

    const result = await cache.getOrFetch(
      "places-photos/nopersist/100x100",
      fetcher,
    );

    expect(Buffer.compare(result.buffer, bytes)).toBe(0);
    expect(result.contentType).toBe("image/jpeg");
    expect(logger.warn).toHaveBeenCalled();

    // Nothing was persisted, so the next request must refetch.
    const second = await cache.getOrFetch(
      "places-photos/nopersist/100x100",
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(Buffer.compare(second.buffer, bytes)).toBe(0);
  });

  it("negatively caches a failed fetch (tombstone)", async () => {
    const { cache } = makeCache();
    const key = "places-photos/tombstone/100x100";
    const failing = vi.fn(async (): Promise<{ buffer: Buffer; contentType: string }> => {
      throw new Error("Google 404");
    });
    const succeeding = vi.fn(async () => ({
      buffer: Buffer.from("valid-bytes"),
      contentType: "image/jpeg",
    }));

    await expect(cache.getOrFetch(key, failing)).rejects.toThrow("Google 404");
    expect(failing).toHaveBeenCalledTimes(1);

    await expect(cache.getOrFetch(key, succeeding)).rejects.toThrow(
      "Photo not cached (tombstone)",
    );
    expect(failing).toHaveBeenCalledTimes(1);
    expect(succeeding).not.toHaveBeenCalled();
  });

  it("retries after the tombstone expires", async () => {
    const { cache, dir } = makeCache();
    const key = "places-photos/expired-tombstone/100x100";
    const failing = vi.fn(async (): Promise<{ buffer: Buffer; contentType: string }> => {
      throw new Error("Google 404");
    });

    await expect(cache.getOrFetch(key, failing)).rejects.toThrow();
    expect(failing).toHaveBeenCalledTimes(1);

    // Backdate the tombstone mtime 2 hours into the past (TTL is 1 hour).
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(resolve(dir, key), past, past);

    const succeeding = vi.fn(async () => ({
      buffer: Buffer.from("recovered-bytes"),
      contentType: "image/jpeg",
    }));
    const result = await cache.getOrFetch(key, succeeding);

    expect(succeeding).toHaveBeenCalledTimes(1);
    expect(result.buffer.toString()).toBe("recovered-bytes");
    expect(result.contentType).toBe("image/jpeg");
  });

  it("propagates the original error even when the tombstone persist fails", async () => {
    const { storage } = makeCache();
    const logger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as never;
    const cache = new PhotoCacheService(storage, logger);
    // All writes fail (tombstone persist included) — storage is down.
    vi.spyOn(storage, "putObject").mockRejectedValue(new Error("disk full"));
    const failing = vi.fn(async (): Promise<{ buffer: Buffer; contentType: string }> => {
      throw new Error("Google 404");
    });

    await expect(
      cache.getOrFetch("places-photos/down/100x100", failing),
    ).rejects.toThrow("Google 404");
    expect(failing).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ key: "places-photos/down/100x100" }),
      "Photo tombstone persist failed",
    );

    // No tombstone was written, so the next request retries the fetch.
    await expect(
      cache.getOrFetch("places-photos/down/100x100", failing),
    ).rejects.toThrow("Google 404");
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
