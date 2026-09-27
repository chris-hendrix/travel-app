import { mkdtempSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  PhotoCacheService,
  PhotoNotCachedError,
  buildPhotoCacheKey,
} from "@/services/photo-cache.service.js";
import { LocalStorageService } from "@/services/storage.service.js";

function makeCache() {
  const dir = mkdtempSync(join(tmpdir(), "photo-cache-test-"));
  const storage = new LocalStorageService(dir);
  const cache = new PhotoCacheService(storage);
  return { cache, storage, dir };
}

describe("PhotoCacheService", () => {
  it("builds short deterministic cache keys (sha256 + box name)", () => {
    const a = buildPhotoCacheKey("places/abc/photos/ref 1", "card");
    // 64-char hex digest + prefix + box: well under MinIO's per-component limit.
    expect(a).toMatch(/^places-photos\/[0-9a-f]{64}\/card$/);
    expect(a.length).toBeLessThan(100);
    // Deterministic and box-sensitive.
    expect(buildPhotoCacheKey("places/abc/photos/ref 1", "card")).toBe(a);
    expect(buildPhotoCacheKey("places/abc/photos/ref 1", "hero")).not.toBe(a);
    expect(buildPhotoCacheKey("places/abc/photos/ref 2", "card")).not.toBe(a);
  });

  it("getBox fetches the source once at the hero box and derives card locally", async () => {
    const { cache, storage } = makeCache();
    const sourceBytes = await sharp({
      create: {
        width: 2000,
        height: 1500,
        channels: 3,
        background: { r: 200, g: 50, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();
    const media = vi.fn(async () => ({
      buffer: sourceBytes,
      contentType: "image/jpeg",
    }));
    const ref = "places/abc/photos/getbox-source";

    // Cold card: exactly one upstream media call, card bytes returned.
    const card = await cache.getBox(ref, "card", media);
    expect(media).toHaveBeenCalledTimes(1);
    expect(card.contentType).toBe("image/jpeg");
    const cardMeta = await sharp(card.buffer).metadata();
    expect(cardMeta.width).toBeLessThanOrEqual(1024);
    expect(cardMeta.width).toBe(1024);

    // The source was stored under the hero key.
    const stored = await storage.getObjectBuffer(
      buildPhotoCacheKey(ref, "hero"),
    );
    expect(stored).not.toBeNull();
    expect(Buffer.compare(stored!.buffer, sourceBytes)).toBe(0);

    // Hero is now warm: zero further media calls.
    const hero = await cache.getBox(ref, "hero", media);
    expect(media).toHaveBeenCalledTimes(1);
    expect(Buffer.compare(hero.buffer, sourceBytes)).toBe(0);

    // Warm card: zero calls of either kind.
    await cache.getBox(ref, "card", media);
    expect(media).toHaveBeenCalledTimes(1);
  });

  it("getBox suppresses retries after a failed source fetch (tombstone)", async () => {
    const { cache, dir } = makeCache();
    const ref = "places/abc/photos/getbox-broken";
    const failing = vi.fn(
      async (): Promise<{ buffer: Buffer; contentType: string }> => {
        throw new Error("Google 404");
      },
    );

    await expect(cache.getBox(ref, "card", failing)).rejects.toThrow(
      "Google 404",
    );
    expect(failing).toHaveBeenCalledTimes(1);

    // Within the hour the tombstone answers: no new upstream call.
    const succeeding = vi.fn(async () => ({
      buffer: Buffer.from("valid-bytes"),
      contentType: "image/jpeg",
    }));
    await expect(cache.getBox(ref, "card", succeeding)).rejects.toThrow(
      PhotoNotCachedError,
    );
    expect(failing).toHaveBeenCalledTimes(1);
    expect(succeeding).not.toHaveBeenCalled();

    // After the hour the source retries.
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(
      resolve(dir, buildPhotoCacheKey(ref, "hero")),
      past,
      past,
    );
    const sourceBytes = await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 3,
        background: { r: 50, g: 200, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();
    const recovered = vi.fn(async () => ({
      buffer: sourceBytes,
      contentType: "image/jpeg",
    }));
    const card = await cache.getBox(ref, "card", recovered);
    expect(recovered).toHaveBeenCalledTimes(1);
    expect(card.contentType).toBe("image/jpeg");
  });

  it("purgeOlderThan deletes box-keyed source and derived blobs alike", async () => {
    const { cache, dir } = makeCache();
    const ref = "places/abc/photos/getbox-purge";
    const sourceKey = buildPhotoCacheKey(ref, "hero");
    const cardKey = buildPhotoCacheKey(ref, "card");
    const freshKey = buildPhotoCacheKey("places/abc/photos/getbox-fresh", "card");
    for (const k of [sourceKey, cardKey, freshKey]) {
      await cache.getOrFetch(k, async () => ({
        buffer: Buffer.from(`bytes-for-${k}`),
        contentType: "image/jpeg",
      }));
    }

    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    utimesSync(resolve(dir, sourceKey), fortyDaysAgo, fortyDaysAgo);
    utimesSync(resolve(dir, cardKey), fortyDaysAgo, fortyDaysAgo);

    const deleted = await cache.purgeOlderThan(30 * 24 * 60 * 60 * 1000);
    expect(deleted).toContain(sourceKey);
    expect(deleted).toContain(cardKey);
    expect(deleted).not.toContain(freshKey);
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
