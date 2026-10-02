import { describe, expect, it } from "vitest";
import type { Trip } from "@/components/trip/TripCard";
import { groupTrips } from "@/lib/tripGroups";

function trip(over: Partial<Trip> & { id: string }): Trip {
  return {
    title: "Trip",
    location: "Somewhere",
    image: "",
    coverImageUrl: null,
    going: 1,
    description: null,
    preferredTimezone: "Europe/Madrid",
    startDate: "2026-01-01",
    endDate: "2026-01-05",
    ...over,
  };
}

const today = new Date(2026, 8, 19); // Sep 19 2026, local

describe("groupTrips", () => {
  it("puts upcoming trips first, soonest first", () => {
    const trips = [
      trip({ id: "far", startDate: "2026-12-01", endDate: "2026-12-05" }),
      trip({ id: "near", startDate: "2026-09-25", endDate: "2026-09-28" }),
    ];

    expect(groupTrips(trips, today).upcoming.map((t) => t.id)).toEqual([
      "near",
      "far",
    ]);
  });

  it("orders past trips newest first, across year boundaries", () => {
    const trips = [
      trip({ id: "lastYear", startDate: "2025-11-01", endDate: "2025-11-08" }),
      trip({ id: "thisYear", startDate: "2026-07-01", endDate: "2026-07-04" }),
      trip({ id: "older", startDate: "2024-05-01", endDate: "2024-05-10" }),
    ];

    expect(groupTrips(trips, today).past.map((t) => t.id)).toEqual([
      "thisYear",
      "lastYear",
      "older",
    ]);
  });

  it("gives a trip that has started but not finished its own group", () => {
    // It used to be the head of `upcoming`, on the argument that you are on
    // it. It sorted first there either way; what changed is that the list now
    // agrees with the card, which has said `underway` all along.
    const inProgress = trip({
      id: "now",
      startDate: "2026-09-17",
      endDate: "2026-09-22",
    });

    const { current, upcoming, past } = groupTrips([inProgress], today);

    expect(current.map((t) => t.id)).toEqual(["now"]);
    expect(upcoming).toEqual([]);
    expect(past).toEqual([]);
  });

  it("counts a trip starting today as underway", () => {
    const startsToday = trip({
      id: "today",
      startDate: "2026-09-19",
      endDate: "2026-09-24",
    });

    expect(groupTrips([startsToday], today).current).toHaveLength(1);
  });

  it("counts a trip ending today as underway, not past", () => {
    const endsToday = trip({
      id: "today",
      startDate: "2026-09-15",
      endDate: "2026-09-19",
    });

    const { current, past } = groupTrips([endsToday], today);

    expect(current).toHaveLength(1);
    expect(past).toEqual([]);
  });

  it("orders underway trips soonest first", () => {
    const trips = [
      trip({ id: "later", startDate: "2026-09-18", endDate: "2026-09-30" }),
      trip({ id: "earlier", startDate: "2026-09-14", endDate: "2026-09-21" }),
    ];

    expect(groupTrips(trips, today).current.map((t) => t.id)).toEqual([
      "earlier",
      "later",
    ]);
  });

  it("puts every trip in exactly one group", () => {
    // The split is only worth having if it partitions: a trip in two groups
    // renders twice, and a trip in none disappears.
    const trips = [
      trip({ id: "past", startDate: "2026-01-01", endDate: "2026-01-05" }),
      trip({ id: "now", startDate: "2026-09-17", endDate: "2026-09-22" }),
      trip({ id: "next", startDate: "2026-10-01", endDate: "2026-10-05" }),
    ];

    const { current, upcoming, past } = groupTrips(trips, today);
    const ids = [...current, ...upcoming, ...past].map((t) => t.id);

    expect(ids.sort()).toEqual(["next", "now", "past"]);
    expect(current.map((t) => t.id)).toEqual(["now"]);
    expect(upcoming.map((t) => t.id)).toEqual(["next"]);
    expect(past.map((t) => t.id)).toEqual(["past"]);
  });

  it("returns three empty lists for no trips", () => {
    expect(groupTrips([], today)).toEqual({
      current: [],
      upcoming: [],
      past: [],
    });
  });
});
