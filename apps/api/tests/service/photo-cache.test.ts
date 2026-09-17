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
});
