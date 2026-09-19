import { describe, expect, it } from "vitest";
import { membersFor } from "@/mocks/members";
import { TRIPS } from "@/mocks/trips";
import type { Trip } from "@/components/trip/TripCard";

function trip(over: Partial<Trip> = {}): Trip {
  return {
    id: "picos",
    title: "Los Picos Trail",
    location: "Mallorca",
    image: "",
    going: 6,
    description: null,
    preferredTimezone: "Europe/Madrid",
    startDate: "2026-09-24",
    endDate: "2026-10-01",
    ...over,
  };
}

describe("membersFor", () => {
  it("returns exactly as many going as the trip claims", () => {
    for (const candidate of [...TRIPS, trip({ id: "solo", going: 1 })]) {
      const going = membersFor(candidate).filter((m) => m.status === "going");
      expect(going).toHaveLength(candidate.going);
    }
  });

  it("never lists the same person twice", () => {
    for (const candidate of TRIPS) {
      const names = membersFor(candidate).map((m) => m.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("shows the undecided and the refusals, not just the yeses", () => {
    const statuses = new Set(membersFor(trip()).map((m) => m.status));
    expect(statuses).toContain("going");
    expect(statuses.size).toBeGreaterThan(1);
  });

  it("gives a different trip a different roster", () => {
    const picos = membersFor(trip({ id: "picos" })).map((m) => m.name);
    const lisbon = membersFor(trip({ id: "lisbon" })).map((m) => m.name);
    expect(picos).not.toEqual(lisbon);
  });

  it("is stable for the same trip", () => {
    expect(membersFor(trip())).toEqual(membersFor(trip()));
  });
});
