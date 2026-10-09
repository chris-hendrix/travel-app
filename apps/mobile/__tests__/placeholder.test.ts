import { describe, expect, it } from "vitest";
import { KINDS, placeholderKind } from "@/lib/placeholder";
import type { PlaceholderKind } from "@/lib/placeholder";
import type { ItineraryEvent } from "@/lib/itinerary";
import type { Stay } from "@/lib/stays";
import type { Trip } from "@/components/trip/TripCard";

const eventBase: ItineraryEvent = {
  id: "event-1",
  name: "Dinner",
  type: "misc",
  description: null,
  startTime: "2026-09-19T19:00:00",
  endTime: null,
  allDay: false,
  place: "Somewhere",
  image: "https://x/y.jpg",
  deletedAt: null,
};

const stayBase: Stay = {
  id: "stay-1",
  name: "Jordans",
  address: "123 Main St, Miami, FL 33101, USA",
  addressLat: null,
  addressLon: null,
  description: null,
  checkIn: null,
  checkOut: null,
  image: "https://x/y.jpg",
  links: [],
  deletedAt: null,
};

const tripBase: Trip = {
  id: "trip-1",
  title: "Mallorca",
  location: "Mallorca",
  image: "https://x/y.jpg",
  coverImageUrl: null,
  going: 4,
  description: null,
} as Trip;

describe("placeholderKind", () => {
  it("returns the event's own type", () => {
    expect(
      placeholderKind({ ...eventBase, type: "food_and_drink" }),
    ).toBe("food_and_drink");
    expect(placeholderKind({ ...eventBase, type: "travel" })).toBe("travel");
  });

  it("returns lodging for a stay", () => {
    expect(placeholderKind(stayBase)).toBe("lodging");
  });

  it("returns trip for a trip", () => {
    expect(placeholderKind(tripBase)).toBe("trip");
  });

  it("every kind has a photo", () => {
    // Derived, not written out: a new `PlaceholderKind` lands here by
    // existing. The real totality gate is typecheck — `KINDS` is a
    // `Record<PlaceholderKind, number>`, so a kind without a photo is a
    // compile error, not a blank frame.
    const kinds = Object.keys(KINDS) as PlaceholderKind[];
    expect(kinds.length).toBeGreaterThanOrEqual(10);
    for (const occasion of ["beach", "wedding", "bachelor"] as const) {
      expect(kinds).toContain(occasion);
    }
    for (const kind of kinds) {
      expect(KINDS[kind]).toBeTruthy();
    }
  });
});
