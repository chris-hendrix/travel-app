// Phase 1 Task 4 RED: place_cache PK + details round-trip.
// Phase 2 grows this file later; nothing of Phase 2 belongs here.

import { describe, it, expect, vi } from "vitest";
import { db } from "@/config/database.js";
import { placeCache } from "@/db/schema/index.js";
import { sql } from "drizzle-orm";
import type { CachedPlaceDetails } from "@journiful/shared/types";
import {
  PLACE_CACHE_SCHEMA_VERSION,
  PLACE_INLINE_REFRESH_CAP,
  PlaceCacheService,
} from "@/services/place-cache.service.js";

const details = {
  v: 1 as const,
  name: "La Bodega",
  address: "Carrer de la Mar 14, Sóller",
  shortAddress: "Carrer de la Mar 14",
  lat: 39.77,
  lon: 2.71,
  photos: [],
  country: "ES",
};

const placeId = `test-place-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe("place_cache", () => {
  it("round-trips details intact", async () => {
    await db.insert(placeCache).values({
      provider: "google",
      placeId,
      schemaVersion: 1,
      details,
      fetchedAt: new Date(),
    });
    const rows = await db
      .select()
      .from(placeCache)
      .where(sql`${placeCache.placeId} = ${placeId}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toEqual(details);
    await db
      .delete(placeCache)
      .where(sql`${placeCache.placeId} = ${placeId}`);
  });

  it("rejects a duplicate (provider, place_id) with a primary-key violation", async () => {
    const dup = `test-place-dup-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await db.insert(placeCache).values({
      provider: "google",
      placeId: dup,
      schemaVersion: 1,
      details,
      fetchedAt: new Date(),
    });
    await expect(
      db.insert(placeCache).values({
        provider: "google",
        placeId: dup,
        schemaVersion: 1,
        details,
        fetchedAt: new Date(),
      }),
    ).rejects.toThrow();
    await db.delete(placeCache).where(sql`${placeCache.placeId} = ${dup}`);
  });
});

// ---- Phase 2: cache reads, writes, and expiry ----

const DAY_MS = 24 * 60 * 60 * 1000;

function uniq(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function makeDetails(name: string, placeId: string): CachedPlaceDetails {
  return {
    v: 1,
    name,
    address: `${name} address, S\u00f3ller`,
    shortAddress: `${name} street`,
    lat: 39.77,
    lon: 2.71,
    photos: [
      {
        ref: `places/${placeId}/photos/ref1`,
        widthPx: 1920,
        heightPx: 1080,
        authorName: "Marta R.",
        authorUri: "https://example.com/marta",
        authorPhotoUri: null,
        mapsUri: "https://maps.google.com/photo/1",
      },
    ],
    country: "ES",
  };
}

async function seedRow(
  placeId: string,
  details: CachedPlaceDetails,
  fetchedAt: Date = new Date(),
  schemaVersion = PLACE_CACHE_SCHEMA_VERSION,
) {
  await db.insert(placeCache).values({
    provider: "google",
    placeId,
    schemaVersion,
    details,
    fetchedAt,
  });
}

async function clearRows(placeIds: string[]) {
  for (const placeId of placeIds) {
    await db.delete(placeCache).where(sql`${placeCache.placeId} = ${placeId}`);
  }
}

describe("place-cache resolve (TTL-on-read)", () => {
  it("serves a fresh row with zero fetcher calls", async () => {
    const placeId = uniq("test-pc-fresh");
    await seedRow(placeId, makeDetails("La Bodega", placeId));
    try {
      const fetcher = vi.fn(async () => makeDetails("Other", placeId));
      const svc = new PlaceCacheService(db, fetcher);
      const summary = await svc.resolve("google", placeId);
      expect(fetcher).not.toHaveBeenCalled();
      expect(summary?.placeId).toBe(placeId);
      expect(summary?.name).toBe("La Bodega");
      expect(summary?.country).toBe("ES");
      expect(summary?.photoSourceUri).toBe(
        "https://maps.google.com/photo/1",
      );
    } finally {
      await clearRows([placeId]);
    }
  });

  it("refreshes a row older than 30 days with exactly one fetch and upserts in place", async () => {
    const placeId = uniq("test-pc-stale");
    await seedRow(
      placeId,
      makeDetails("Old Name", placeId),
      new Date(Date.now() - 31 * DAY_MS),
    );
    try {
      const fetcher = vi.fn(async () => makeDetails("New Name", placeId));
      const svc = new PlaceCacheService(db, fetcher);
      const summary = await svc.resolve("google", placeId);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(summary?.name).toBe("New Name");
      const rows = await db
        .select()
        .from(placeCache)
        .where(sql`${placeCache.placeId} = ${placeId}`);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.details.name).toBe("New Name");
      expect(
        Date.now() - rows[0]!.fetchedAt.getTime(),
      ).toBeLessThan(DAY_MS);
    } finally {
      await clearRows([placeId]);
    }
  });
});

describe("place-cache resolveMany (batched)", () => {
  it("resolves 30 rows over 4 places to a map of 4 with no fetcher calls", async () => {
    const ids = [0, 1, 2, 3].map(() => uniq("test-pc-batch"));
    for (const id of ids) {
      await seedRow(id, makeDetails(`Place ${id.slice(-4)}`, id));
    }
    try {
      const fetcher = vi.fn(async () => makeDetails("X", "x"));
      const svc = new PlaceCacheService(db, fetcher);
      const pairs = Array.from({ length: 30 }, (_, i) => ({
        provider: "google",
        placeId: ids[i % ids.length]!,
      }));
      const map = await svc.resolveMany(pairs);
      expect(map.size).toBe(4);
      for (const id of ids) {
        expect(map.get(`google:${id}`)?.placeId).toBe(id);
      }
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      await clearRows(ids);
    }
  });

  it("returns an empty map for empty input without issuing a statement", async () => {
    const fetcher = vi.fn(async () => makeDetails("X", "x"));
    const svc = new PlaceCacheService(db, fetcher);
    const map = await svc.resolveMany([]);
    expect(map.size).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("place-cache inline refresh (bounded)", () => {
  it("list mode refreshes 2 misses with exactly 2 fetches", async () => {
    const ids = [uniq("test-pc-l2a"), uniq("test-pc-l2b")];
    try {
      const fetcher = vi.fn(
        async (_provider: string, placeId: string) =>
          makeDetails(`N ${placeId.slice(-4)}`, placeId),
      );
      const svc = new PlaceCacheService(db, fetcher);
      const map = await svc.resolveMany(
        ids.map((placeId) => ({ provider: "google", placeId })),
        { mode: "list" },
      );
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(map.size).toBe(2);
      for (const id of ids) {
        expect(map.get(`google:${id}`)?.placeId).toBe(id);
      }
    } finally {
      await clearRows(ids);
    }
  });

  it("list mode caps 8 misses at PLACE_INLINE_REFRESH_CAP fetches, nulling the rest", async () => {
    expect(PLACE_INLINE_REFRESH_CAP).toBe(3);
    const ids = Array.from({ length: 8 }, () => uniq("test-pc-l8"));
    try {
      const fetcher = vi.fn(
        async (_provider: string, placeId: string) =>
          makeDetails(`N ${placeId.slice(-4)}`, placeId),
      );
      const svc = new PlaceCacheService(db, fetcher);
      const map = await svc.resolveMany(
        ids.map((placeId) => ({ provider: "google", placeId })),
        { mode: "list" },
      );
      expect(fetcher).toHaveBeenCalledTimes(PLACE_INLINE_REFRESH_CAP);
      const populated = [...map.values()].filter((v) => v !== null);
      const nulled = [...map.values()].filter((v) => v === null);
      expect(populated).toHaveLength(PLACE_INLINE_REFRESH_CAP);
      expect(nulled).toHaveLength(8 - PLACE_INLINE_REFRESH_CAP);
    } finally {
      await clearRows(ids);
    }
  });

  it("detail mode refreshes its one miss with exactly 1 fetch", async () => {
    const placeId = uniq("test-pc-detail");
    try {
      const fetcher = vi.fn(async () => makeDetails("Detail", placeId));
      const svc = new PlaceCacheService(db, fetcher);
      const summary = await svc.resolve("google", placeId);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(summary?.name).toBe("Detail");
    } finally {
      await clearRows([placeId]);
    }
  });

  it("detail mode returns null without throwing when the fetch fails", async () => {
    const placeId = uniq("test-pc-detail-fail");
    const fetcher = vi.fn(async (): Promise<CachedPlaceDetails> => {
      throw new Error("google down");
    });
    const svc = new PlaceCacheService(db, fetcher);
    await expect(svc.resolve("google", placeId)).resolves.toBeNull();
  });

  it("list mode returns all nulls without throwing when every fetch fails", async () => {
    const ids = [uniq("test-pc-lf1"), uniq("test-pc-lf2")];
    const fetcher = vi.fn(async (): Promise<CachedPlaceDetails> => {
      throw new Error("google down");
    });
    const svc = new PlaceCacheService(db, fetcher);
    const map = await svc.resolveMany(
      ids.map((placeId) => ({ provider: "google", placeId })),
      { mode: "list" },
    );
    expect(map.size).toBe(2);
    expect([...map.values()]).toEqual([null, null]);
  });
});

describe("place-cache shared-miss dedupe", () => {
  it("20 rows sharing one missing place issue exactly one fetch and populate all 20", async () => {
    const placeId = uniq("test-pc-shared");
    try {
      const fetcher = vi.fn(async () => makeDetails("Shared", placeId));
      const svc = new PlaceCacheService(db, fetcher);
      const pairs = Array.from({ length: 20 }, () => ({
        provider: "google",
        placeId,
      }));
      const map = await svc.resolveMany(pairs, { mode: "list" });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(map.size).toBe(1);
      expect(map.get(`google:${placeId}`)?.name).toBe("Shared");
    } finally {
      await clearRows([placeId]);
    }
  });
});

describe("place-cache photo source guard (F4)", () => {
  it("treats a cached photo with no mapsUri as no photo", async () => {
    const id = uniq("test-pc-nomaps");
    const bad = makeDetails("NoSrc", id);
    bad.photos[0]!.mapsUri = null;
    await seedRow(id, bad);
    try {
      const svc = new PlaceCacheService(db, async () => null);
      const summary = await svc.resolve("google", id);
      expect(summary?.photoUrl).toBeNull();
      expect(summary?.photoSourceUri).toBeNull();
      // The credit rides the same photo as the url: no source link, no
      // credit, so a surface can never show an author without an image.
      expect(summary?.photoAttribution).toBeNull();
    } finally {
      await clearRows([id]);
    }
  });
});

describe("place-cache single warn per request (F6)", () => {
  it("a list read with three failed fetches logs exactly one warn", async () => {
    const ids = [uniq("test-pc-w1"), uniq("test-pc-w2"), uniq("test-pc-w3")];
    const fetcher = vi.fn(async (): Promise<CachedPlaceDetails> => {
      throw new Error("google down");
    });
    const warn = vi.fn();
    const svc = new PlaceCacheService(db, fetcher, { warn } as never);
    const map = await svc.resolveMany(
      ids.map((placeId) => ({ provider: "google", placeId })),
      { mode: "list" },
    );
    expect(map.size).toBe(3);
    expect([...map.values()]).toEqual([null, null, null]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("place-cache detail cap (F8)", () => {
  it("detail mode with three misses issues exactly one fetch and nulls the rest", async () => {
    const ids = [uniq("test-pc-dc1"), uniq("test-pc-dc2"), uniq("test-pc-dc3")];
    try {
      const fetcher = vi.fn(
        async (_provider: string, placeId: string) =>
          makeDetails(`D ${placeId.slice(-4)}`, placeId),
      );
      const svc = new PlaceCacheService(db, fetcher);
      const map = await svc.resolveMany(
        ids.map((placeId) => ({ provider: "google", placeId })),
        { mode: "detail" },
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(map.size).toBe(3);
      expect(map.get(`google:${ids[0]}`)?.placeId).toBe(ids[0]);
      expect(map.get(`google:${ids[1]}`)).toBeNull();
      expect(map.get(`google:${ids[2]}`)).toBeNull();
    } finally {
      await clearRows(ids);
    }
  });
});

describe("place-cache locality passthrough (Phase 1 Task 3)", () => {
  it("carries locality from cached details into the summary", async () => {
    const id = uniq("test-pc-loc");
    const withLocality = { ...makeDetails("Miami Spot", id), locality: "Miami" };
    await seedRow(id, withLocality);
    try {
      const svc = new PlaceCacheService(db, async () => null);
      const summary = await svc.resolve("google", id);
      expect(summary?.locality).toBe("Miami");
    } finally {
      await clearRows([id]);
    }
  });

  it("resolves locality null for a legacy row with no locality key", async () => {
    const id = uniq("test-pc-loc-legacy");
    const legacy = makeDetails("Legacy Spot", id);
    // Every row written before locality shipped lacks the key entirely.
    delete (legacy as { locality?: unknown }).locality;
    expect("locality" in legacy).toBe(false);
    await seedRow(id, legacy);
    try {
      const svc = new PlaceCacheService(db, async () => null);
      let summary;
      await expect(
        (async () => {
          summary = await svc.resolve("google", id);
        })(),
      ).resolves.toBeUndefined();
      expect(summary?.locality).toBeNull();
    } finally {
      await clearRows([id]);
    }
  });
});

describe("place-cache photo-drop log (Phase 4 Task 1)", () => {
  it("logs one debug line naming the dropped and photo-less places with counts", async () => {
    const sourcedId = uniq("test-pc-pd-src");
    const droppedId = uniq("test-pc-pd-drop");
    const emptyId = uniq("test-pc-pd-empty");
    const droppedDetails = makeDetails("NoSrc", droppedId);
    droppedDetails.photos[0]!.mapsUri = null;
    const emptyDetails = makeDetails("NoPhotos", emptyId);
    emptyDetails.photos = [];
    await seedRow(sourcedId, makeDetails("Sourced", sourcedId));
    await seedRow(droppedId, droppedDetails);
    await seedRow(emptyId, emptyDetails);
    try {
      const fetcher = vi.fn(async () => null);
      const debug = vi.fn();
      const svc = new PlaceCacheService(db, fetcher, { debug } as never);
      const map = await svc.resolveMany(
        [sourcedId, droppedId, emptyId].map((placeId) => ({
          provider: "google",
          placeId,
        })),
        { mode: "list" },
      );
      expect(map.size).toBe(3);
      expect(map.get(`google:${sourcedId}`)?.photoUrl).not.toBeNull();
      expect(map.get(`google:${droppedId}`)?.photoUrl).toBeNull();
      expect(map.get(`google:${emptyId}`)?.photoUrl).toBeNull();
      expect(fetcher).not.toHaveBeenCalled();
      expect(debug).toHaveBeenCalledTimes(1);
      const [payload, msg] = debug.mock.calls[0]!;
      expect(msg).toBe("Place photos unavailable");
      const flat = JSON.stringify(payload);
      expect(flat).toContain(`google:${droppedId}`);
      expect(flat).toContain(`google:${emptyId}`);
      expect(flat).not.toContain(`google:${sourcedId}`);
      // Counts travel with the line: one dropped for want of a source
      // link, one with no photos at all.
      expect(payload).toMatchObject({ droppedCount: 1, noPhotosCount: 1 });
    } finally {
      await clearRows([sourcedId, droppedId, emptyId]);
    }
  });

  it("logs nothing when every photo is sourced", async () => {
    const ids = [uniq("test-pc-pa1"), uniq("test-pc-pa2")];
    for (const id of ids) {
      await seedRow(id, makeDetails(`Place ${id.slice(-4)}`, id));
    }
    try {
      const fetcher = vi.fn(async () => null);
      const debug = vi.fn();
      const svc = new PlaceCacheService(db, fetcher, { debug } as never);
      const map = await svc.resolveMany(
        ids.map((placeId) => ({ provider: "google", placeId })),
        { mode: "list" },
      );
      expect(map.size).toBe(2);
      expect(fetcher).not.toHaveBeenCalled();
      expect(debug).not.toHaveBeenCalled();
    } finally {
      await clearRows(ids);
    }
  });
});

describe("place-cache purge", () => {
  it("deletes rows past the cutoff and stale schema versions, keeps fresh rows, returns the count", async () => {
    const oldId = uniq("test-pc-purge-old");
    const freshId = uniq("test-pc-purge-fresh");
    const oldVersionId = uniq("test-pc-purge-ver");
    await seedRow(
      oldId,
      makeDetails("Old", oldId),
      new Date(Date.now() - 31 * DAY_MS),
    );
    await seedRow(freshId, makeDetails("Fresh", freshId));
    await seedRow(oldVersionId, makeDetails("OldVer", oldVersionId), new Date(), 0);
    try {
      const svc = new PlaceCacheService(db, async () =>
        makeDetails("X", "x"),
      );
      const deleted = await svc.purgeOlderThan(30 * DAY_MS);
      expect(deleted).toBe(2);
      const remaining = await db
        .select()
        .from(placeCache)
        .where(
          sql`${placeCache.placeId} IN (${oldId}, ${freshId}, ${oldVersionId})`,
        );
      expect(remaining.map((r) => r.placeId)).toEqual([freshId]);
    } finally {
      await clearRows([oldId, freshId, oldVersionId]);
    }
  });
});
