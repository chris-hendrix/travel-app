import { describe, it, expect } from "vitest";
import {
  applyFlightLookup,
  getPertinentTime,
  getPertinentLocation,
  getCounterpartTime,
  getCounterpartLocation,
  rankTravelLocations,
  MY_TRAVEL_LOCATIONS_LIMIT,
  mapsSearchUrl,
} from "../utils/travel.js";
import type { FlightLookupResult } from "../schemas/flight.js";

const lookupResult: FlightLookupResult = {
  departureAirport: { iata: "SFO", name: "San Francisco International" },
  departureTime: "2026-07-15T14:00:00Z",
  arrivalAirport: { iata: "JFK", name: "John F. Kennedy International" },
  arrivalTime: "2026-07-15T22:30:00Z",
};

describe("applyFlightLookup", () => {
  it("should fill all four fields plus flight number", () => {
    const filled = applyFlightLookup("arrival", lookupResult, "UA123");

    expect(filled.arrivalTime).toBe(
      new Date("2026-07-15T22:30:00Z").toISOString(),
    );
    expect(filled.arrivalLocation).toBe(
      "John F. Kennedy International (JFK)",
    );
    expect(filled.departureTime).toBe(
      new Date("2026-07-15T14:00:00Z").toISOString(),
    );
    expect(filled.departureLocation).toBe(
      "San Francisco International (SFO)",
    );
    expect(filled.flightNumber).toBe("UA123");
  });

  it("should behave the same for departures (caller splits shown/hidden)", () => {
    const filled = applyFlightLookup("departure", lookupResult, "UA123");
    expect(filled.departureLocation).toBe(
      "San Francisco International (SFO)",
    );
    expect(filled.arrivalLocation).toBe(
      "John F. Kennedy International (JFK)",
    );
  });

  it("should omit IATA suffix when airport has no IATA code", () => {
    const result: FlightLookupResult = {
      ...lookupResult,
      arrivalAirport: { iata: null, name: "Small Regional Airport" },
    };
    const filled = applyFlightLookup("arrival", result, "UA123");
    expect(filled.arrivalLocation).toBe("Small Regional Airport");
  });
});

describe("pertinent/counterpart helpers", () => {
  const arrival = {
    travelType: "arrival" as const,
    arrivalTime: new Date("2026-07-15T22:30:00Z"),
    arrivalLocation: "JFK",
    departureTime: new Date("2026-07-15T14:00:00Z"),
    departureLocation: "SFO",
  };
  const departure = { ...arrival, travelType: "departure" as const };

  it("should return arrival side as pertinent for arrivals", () => {
    expect(getPertinentTime(arrival)).toBe(arrival.arrivalTime);
    expect(getPertinentLocation(arrival)).toBe("JFK");
  });

  it("should return departure side as pertinent for departures", () => {
    expect(getPertinentTime(departure)).toBe(departure.departureTime);
    expect(getPertinentLocation(departure)).toBe("SFO");
  });

  it("should return the mirror side as counterpart", () => {
    expect(getCounterpartTime(arrival)).toBe(arrival.departureTime);
    expect(getCounterpartLocation(arrival)).toBe("SFO");
    expect(getCounterpartTime(departure)).toBe(departure.arrivalTime);
    expect(getCounterpartLocation(departure)).toBe("JFK");
  });

  it("should be null-safe", () => {
    const empty = {
      travelType: "arrival" as const,
      arrivalTime: null,
      arrivalLocation: null,
      departureTime: null,
      departureLocation: null,
    };
    expect(getPertinentTime(empty)).toBeNull();
    expect(getPertinentLocation(empty)).toBeNull();
    expect(getCounterpartTime(empty)).toBeNull();
    expect(getCounterpartLocation(empty)).toBeNull();
  });
});

describe("mapsSearchUrl", () => {
  it("should build a keyless Google Maps search URL", () => {
    expect(mapsSearchUrl("JFK Airport")).toBe(
      "https://www.google.com/maps/search/?api=1&query=JFK%20Airport",
    );
  });
});

/**
 * `rankTravelLocations` is the one answer to "which wheres does this
 * person already have", and two surfaces ask it: the API endpoint that
 * reads the caller's rows across trips, and the demo adapter that stands
 * in for it offline. So this is where the rule is pinned — the callers
 * are two queries around it.
 */
describe("rankTravelLocations", () => {
  /** The two ends, the direction, and when the row was last written. */
  function row(
    updatedAt: number,
    pertinent: string | null,
    counterpart: string | null = null,
    travelType: "arrival" | "departure" = "arrival",
  ) {
    return {
      travelType,
      arrivalLocation: travelType === "arrival" ? pertinent : counterpart,
      departureLocation: travelType === "arrival" ? counterpart : pertinent,
      updatedAt: new Date(updatedAt),
    };
  }

  it("reads newest first, whatever order the rows arrive in", () => {
    const rows = [row(1_000, "Oldest"), row(3_000, "Newest"), row(2_000, "Middle")];

    expect(rankTravelLocations(rows)).toEqual(["Newest", "Middle", "Oldest"]);
  });

  it("keeps the newest spelling of a location, case-insensitively", () => {
    const rows = [row(1_000, "bcn t2"), row(2_000, "BCN T2")];

    expect(rankTravelLocations(rows)).toEqual(["BCN T2"]);
  });

  it("counts both ends of a leg, the record's own end first", () => {
    const rows = [row(1_000, "SJD T1", "SFO T2")];

    expect(rankTravelLocations(rows)).toEqual(["SJD T1", "SFO T2"]);
  });

  it("leads with the departure's own end on a departure", () => {
    const rows = [row(1_000, "LIS T1", "LIS T2", "departure")];

    expect(rankTravelLocations(rows)).toEqual(["LIS T1", "LIS T2"]);
  });

  it("trims, and drops a blank end without spending the cap on it", () => {
    const rows = [
      row(3_000, "  CDG T2  ", "   "),
      row(2_000, null, null),
      row(1_000, "CDG T1"),
    ];

    expect(rankTravelLocations(rows, 2)).toEqual(["CDG T2", "CDG T1"]);
  });

  it("caps the answer, on locations rather than rows", () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      row(1_000 + index, `Where ${index}`, null),
    );

    expect(rankTravelLocations(rows, 3)).toEqual([
      "Where 4",
      "Where 3",
      "Where 2",
    ]);
    expect(rankTravelLocations(rows, 3)).toHaveLength(3);
  });

  it("caps at the shared limit by default", () => {
    const rows = Array.from({ length: 25 }, (_, index) =>
      row(1_000 + index, `Where ${index}`),
    );

    const locations = rankTravelLocations(rows);

    expect(locations).toHaveLength(MY_TRAVEL_LOCATIONS_LIMIT);
    expect(locations[0]).toBe("Where 24");
    expect(locations).not.toContain("Where 4");
  });

  it("keeps one location from each end of a leg, once", () => {
    const rows = [
      row(2_000, "Same", "Same"),
      row(1_000, "Same", "Other"),
    ];

    expect(rankTravelLocations(rows)).toEqual(["Same", "Other"]);
  });

  it("has no answer for no rows", () => {
    expect(rankTravelLocations([])).toEqual([]);
  });
});
