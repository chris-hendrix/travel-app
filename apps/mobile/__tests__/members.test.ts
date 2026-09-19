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

  it("marks one organizer, and only someone who is going", () => {
    for (const candidate of [...TRIPS, trip({ id: "solo", going: 1 })]) {
      const organizers = membersFor(candidate).filter((m) => m.isOrganizer);
      expect(organizers).toHaveLength(1);
      expect(organizers[0]!.status).toBe("going");
    }
  });

  it("puts the organizer at the top", () => {
    for (const candidate of [...TRIPS, trip({ id: "solo", going: 1 })]) {
      expect(membersFor(candidate)[0]!.isOrganizer).toBe(true);
    }
  });

  it("gives every member a number, and shows both sharing states", () => {
    for (const candidate of TRIPS) {
      const roster = membersFor(candidate);
      expect(roster.every((m) => m.phone.length > 0)).toBe(true);
      // Both states have to appear or the organizer's view and the
      // traveler's would look identical and the rule would go unproven.
      expect(roster.some((m) => m.sharePhone)).toBe(true);
      expect(roster.some((m) => !m.sharePhone)).toBe(true);
    }
  });

  it("gives handles that match the name, in all four states", () => {
    const roster = membersFor(trip({ going: 8 }));

    for (const person of roster) {
      const slug = person.name.toLowerCase().replace(/[^a-z]+/g, "-");
      if (person.handles?.venmo) expect(person.handles.venmo).toBe(slug);
      if (person.handles?.instagram) {
        expect(person.handles.instagram).toBe(slug.replace(/-/g, "."));
      }
    }

    expect(roster.some((m) => m.handles?.venmo && m.handles?.instagram)).toBe(
      true,
    );
    expect(roster.some((m) => m.handles?.instagram && !m.handles?.venmo)).toBe(
      true,
    );
    expect(roster.some((m) => m.handles?.venmo && !m.handles?.instagram)).toBe(
      true,
    );
    expect(roster.some((m) => m.handles === null)).toBe(true);
  });
});
