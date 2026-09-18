import { describe, it, expect } from "vitest";
import {
  applyFlightLookup,
  getPertinentTime,
  getPertinentLocation,
  getCounterpartTime,
  getCounterpartLocation,
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
