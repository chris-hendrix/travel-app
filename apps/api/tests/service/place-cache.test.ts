// Phase 1 Task 4 RED: place_cache PK + details round-trip.
// Phase 2 grows this file later; nothing of Phase 2 belongs here.

import { describe, it, expect } from "vitest";
import { db } from "@/config/database.js";
import { placeCache } from "@/db/schema/index.js";
import { sql } from "drizzle-orm";

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
