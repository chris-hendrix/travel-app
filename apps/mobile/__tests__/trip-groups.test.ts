import { describe, expect, it } from "vitest";
import type { Trip } from "@/components/trip/TripCard";
import { groupTrips } from "@/lib/tripGroups";

function trip(over: Partial<Trip> & { id: string }): Trip {
  return {
    title: "Trip",
    location: "Somewhere",
    image: "",
    going: 1,
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

  it("counts a trip that has started but not finished as upcoming", () => {
    const inProgress = trip({
      id: "now",
      startDate: "2026-09-17",
      endDate: "2026-09-22",
    });

    const { upcoming, past } = groupTrips([inProgress], today);

    expect(upcoming.map((t) => t.id)).toEqual(["now"]);
    expect(past).toEqual([]);
  });

  it("treats a trip ending today as still upcoming", () => {
    const endsToday = trip({
      id: "today",
      startDate: "2026-09-15",
      endDate: "2026-09-19",
    });

    expect(groupTrips([endsToday], today).upcoming).toHaveLength(1);
  });

  it("returns empty lists for no trips", () => {
    expect(groupTrips([], today)).toEqual({ upcoming: [], past: [] });
  });
});
