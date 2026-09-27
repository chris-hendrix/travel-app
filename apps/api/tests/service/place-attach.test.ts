/**
 * F7 RED: `attachPlaces` must log once when `resolveMany` throws (the
 * DB SELECT failing, not a Google miss) before degrading every row to
 * `place: null` — DB-down and Google-miss must be distinguishable.
 * Pure: a throwing stub stands in for the cache, so no DB is touched.
 */

import { describe, it, expect, vi } from "vitest";
import { attachPlaces } from "@/services/place-attach.service.js";

describe("attachPlaces resolve failure", () => {
  it("logs once and degrades every row to null when resolveMany throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const placeCache = {
        resolveMany: async (): Promise<never> => {
          throw new Error("db down");
        },
      } as never;
      const rows = [
        { placeProvider: "google", externalPlaceId: "ChIJ1" },
        { placeProvider: "google", externalPlaceId: "ChIJ2" },
      ];
      const attached = await attachPlaces(rows, placeCache, "list");
      expect(attached).toEqual([
        { placeProvider: "google", externalPlaceId: "ChIJ1", place: null },
        { placeProvider: "google", externalPlaceId: "ChIJ2", place: null },
      ]);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
