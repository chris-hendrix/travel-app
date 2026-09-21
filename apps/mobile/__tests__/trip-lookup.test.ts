import { describe, expect, it } from "vitest";
import type { Trip } from "@/components/trip/TripCard";
import { tripFor } from "@/lib/tripLookup";

function trip(id: string): Trip {
  return {
    id,
    title: id,
    location: "Nowhere",
    image: "",
    going: 1,
    description: null,
    preferredTimezone: "Europe/Madrid",
    startDate: "2026-01-01",
    endDate: "2026-01-02",
  };
}

const trips = [trip("picos"), trip("lisbon")];

describe("tripFor", () => {
  it("returns the trip with the matching id", () => {
    expect(tripFor(trips, "picos")).toBe(trips[0]);
  });

  it("returns undefined for an unknown id, never another trip", () => {
    expect(tripFor(trips, "nope")).toBeUndefined();
  });

  it("returns undefined for an undefined id", () => {
    expect(tripFor(trips, undefined)).toBeUndefined();
  });

  it("returns undefined for an empty-string id", () => {
    expect(tripFor(trips, "")).toBeUndefined();
  });
});
