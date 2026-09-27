/**
 * The place block's update rule (`services/place-block.service.ts`).
 *
 * Pure, so every branch is reachable here: the three update services
 * (trip, event, accommodation) share this rule, and a table of cases is
 * the only place the "absent / replaced / cleared" distinction can be
 * pinned once instead of three times.
 */

import { describe, it, expect, vi } from "vitest";
import {
  applyPlaceBlockPatch,
  placeBlockPatch,
  type StoredPlacePair,
} from "@/services/place-block.service.js";

const noStoredPair = async (): Promise<StoredPlacePair | undefined> =>
  undefined;

function stored(provider: string | null, placeId: string | null) {
  return async (): Promise<StoredPlacePair | undefined> => ({
    placeProvider: provider,
    placeId,
  });
}

describe("placeBlockPatch", () => {
  it("reads nothing when the request does not carry a pair", async () => {
    const loadStoredPair = vi.fn(noStoredPair);

    const patch = await placeBlockPatch({}, loadStoredPair);

    expect(patch).toEqual({});
    expect(loadStoredPair).not.toHaveBeenCalled();
  });

  it("leaves the text alone when the request omits it", async () => {
    const patch = await placeBlockPatch(
      { placeProvider: "google", placeId: "ChIJ1" },
      noStoredPair,
    );

    expect(patch).toEqual({ placeProvider: "google", placeId: "ChIJ1" });
    expect(patch).not.toHaveProperty("placeName");
    expect(patch).not.toHaveProperty("placeAddress");
  });

  it("keeps the stored snapshot when the identical pair is re-sent", async () => {
    const patch = await placeBlockPatch(
      { placeProvider: "google", placeId: "ChIJ1" },
      stored("google", "ChIJ1"),
    );

    expect(patch).not.toHaveProperty("placeName");
    expect(patch).not.toHaveProperty("placeAddress");
  });

  it("clears the text when a different pair replaces the stored one", async () => {
    const patch = await placeBlockPatch(
      { placeProvider: "google", placeId: "ChIJ2" },
      stored("google", "ChIJ1"),
    );

    expect(patch).toEqual({
      placeProvider: "google",
      placeId: "ChIJ2",
      placeName: null,
      placeAddress: null,
    });
  });

  it("clears the text when the stored row carries no pair", async () => {
    const patch = await placeBlockPatch(
      { placeProvider: "google", placeId: "ChIJ2" },
      stored(null, null),
    );

    expect(patch.placeName).toBeNull();
    expect(patch.placeAddress).toBeNull();
  });

  it("honours the request's own text over a replaced pair", async () => {
    const patch = await placeBlockPatch(
      {
        placeProvider: "google",
        placeId: "ChIJ2",
        placeName: "La Bodega",
        placeAddress: "Carrer de la Mar 14",
      },
      stored("google", "ChIJ1"),
    );

    expect(patch).toEqual({
      placeProvider: "google",
      placeId: "ChIJ2",
      placeName: "La Bodega",
      placeAddress: "Carrer de la Mar 14",
    });
  });

  it("clears the whole block on an explicit null pair", async () => {
    const loadStoredPair = vi.fn(noStoredPair);

    const patch = await placeBlockPatch(
      { placeProvider: null, placeId: null },
      loadStoredPair,
    );

    expect(patch).toEqual({
      placeProvider: null,
      placeId: null,
      placeName: null,
      placeAddress: null,
    });
    expect(loadStoredPair).not.toHaveBeenCalled();
  });

  it("clears the whole block on a half pair rather than storing it", async () => {
    const patch = await placeBlockPatch(
      { placeProvider: "google" },
      noStoredPair,
    );

    expect(patch).toEqual({
      placeProvider: null,
      placeId: null,
      placeName: null,
      placeAddress: null,
    });
  });

  it("writes an explicit null text without a pair", async () => {
    const patch = await placeBlockPatch({ placeName: null }, noStoredPair);

    expect(patch).toEqual({ placeName: null });
  });
});

describe("applyPlaceBlockPatch", () => {
  it("drops the columns the patch omits and writes the ones it names", () => {
    const target: Record<string, unknown> = {
      name: "Kyoto",
      placeProvider: undefined,
      placeId: undefined,
      placeName: undefined,
      placeAddress: undefined,
    };

    applyPlaceBlockPatch(target, { placeProvider: "google", placeId: "ChIJ1" });

    // The payload started as `{...data}`, so the omitted columns are
    // present-and-undefined until they are dropped.
    expect("placeName" in target).toBe(false);
    expect("placeAddress" in target).toBe(false);
    expect(target).toEqual({
      name: "Kyoto",
      placeProvider: "google",
      placeId: "ChIJ1",
    });
  });

  it("writes the columns the patch names, nulls included", () => {
    const target: Record<string, unknown> = {
      name: "Kyoto",
      placeProvider: "google",
      placeId: "ChIJ1",
      placeName: "Old place",
      placeAddress: "Old address",
    };

    applyPlaceBlockPatch(target, {
      placeProvider: null,
      placeId: null,
      placeName: null,
      placeAddress: null,
    });

    expect(target).toEqual({
      name: "Kyoto",
      placeProvider: null,
      placeId: null,
      placeName: null,
      placeAddress: null,
    });
  });
});
