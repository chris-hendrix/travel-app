import { describe, it, expect } from "vitest";
import { resolveDiscoverLocations } from "./discover-location";

const TRIP = {
  destinationLat: 48.8566,
  destinationLon: 2.3522,
  destination: "Paris, France",
};

const NOW = new Date("2026-09-13T12:00:00.000Z");

function acc(overrides: Partial<Parameters<typeof resolveDiscoverLocations>[1][number]> & { id: string }) {
  return {
    name: overrides.id,
    addressLat: 1,
    addressLon: 2,
    checkIn: null,
    ...overrides,
  };
}

describe("resolveDiscoverLocations - Task 1: time-nearest sort + trip-last fallback", () => {
  it("sorts nearest-dated accommodation first", () => {
    const result = resolveDiscoverLocations(TRIP, [
      acc({ id: "far", checkIn: "2026-09-20T12:00:00.000Z" }),
      acc({ id: "near", checkIn: "2026-09-14T12:00:00.000Z" }),
    ], NOW);
    expect(result.map((l) => l.accommodationId)).toEqual(["near", "far", undefined]);
    expect(result[0]).toMatchObject({ source: "accommodation", lat: 1, lon: 2, name: "near" });
    expect(result[result.length - 1]).toMatchObject({ source: "trip" });
  });

  it("sorts null and unparseable checkIn behind dated accommodations", () => {
    const result = resolveDiscoverLocations(TRIP, [
      acc({ id: "null-checkin", checkIn: null }),
      acc({ id: "dated", checkIn: "2026-09-14T12:00:00.000Z" }),
      acc({ id: "bad-checkin", checkIn: "not-a-date" }),
    ], NOW);
    expect(result[0].accommodationId).toBe("dated");
    expect(result.map((l) => l.accommodationId).slice(1, 3).sort()).toEqual(["bad-checkin", "null-checkin"]);
  });

  it("excludes accommodations without coords", () => {
    const result = resolveDiscoverLocations(TRIP, [
      { ...acc({ id: "no-lat", checkIn: "2026-09-13T13:00:00.000Z" }), addressLat: null },
      { ...acc({ id: "no-lon", checkIn: "2026-09-13T13:00:00.000Z" }), addressLon: null },
      acc({ id: "ok", checkIn: "2026-09-20T12:00:00.000Z" }),
    ], NOW);
    expect(result.map((l) => l.accommodationId)).toEqual(["ok", undefined]);
  });

  it("yields trip-only when no accommodations have coords", () => {
    const result = resolveDiscoverLocations(TRIP, [], NOW);
    expect(result).toEqual([
      { lat: 48.8566, lon: 2.3522, name: "Paris, France", source: "trip" },
    ]);
  });

  it("yields empty array when neither accommodations nor trip coords exist", () => {
    expect(resolveDiscoverLocations(undefined, undefined, NOW)).toEqual([]);
    expect(
      resolveDiscoverLocations({ destinationLat: null, destinationLon: null, destination: null }, [], NOW),
    ).toEqual([]);
  });
});

describe("resolveDiscoverLocations - Task 2: ties, invalid inputs, stability", () => {
  it("prefers future over past when equidistant from now", () => {
    const result = resolveDiscoverLocations(undefined, [
      acc({ id: "past", checkIn: "2026-09-12T12:00:00.000Z" }),
      acc({ id: "future", checkIn: "2026-09-14T12:00:00.000Z" }),
    ], NOW);
    expect(result.map((l) => l.accommodationId)).toEqual(["future", "past"]);
  });

  it("sorts identical checkIn by id ascending", () => {
    const result = resolveDiscoverLocations(undefined, [
      acc({ id: "b-id", checkIn: "2026-09-14T12:00:00.000Z" }),
      acc({ id: "a-id", checkIn: "2026-09-14T12:00:00.000Z" }),
    ], NOW);
    expect(result.map((l) => l.accommodationId)).toEqual(["a-id", "b-id"]);
  });

  it("handles undefined and empty inputs", () => {
    expect(resolveDiscoverLocations(undefined, undefined, NOW)).toEqual([]);
    expect(resolveDiscoverLocations(TRIP, undefined, NOW)).toEqual([
      { lat: 48.8566, lon: 2.3522, name: "Paris, France", source: "trip" },
    ]);
    expect(resolveDiscoverLocations(undefined, [], NOW)).toEqual([]);
  });

  it("treats invalid checkIn string as far-future but still eligible", () => {
    const result = resolveDiscoverLocations(undefined, [
      acc({ id: "invalid", checkIn: "garbage!!!" }),
      acc({ id: "dated", checkIn: "2026-09-14T12:00:00.000Z" }),
    ], NOW);
    expect(result.map((l) => l.accommodationId)).toEqual(["dated", "invalid"]);
  });
});
