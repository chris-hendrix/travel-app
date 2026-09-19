import { describe, expect, it } from "vitest";
import type { FlightLookupResult } from "@journiful/shared/types";
import {
  buildLegRecord,
  emptyLeg,
  legFromLookup,
  legFromRecord,
  validateNewTravel,
  type NewTravelInput,
} from "@/lib/newTravel";

const ARRIVAL = {
  ...emptyLeg(),
  day: "2026-09-18",
  time: "15:40",
  location: "BCN T2",
  flightNumber: "UA 1842",
};

const VALID: NewTravelInput = {
  memberId: "m-1",
  arrival: ARRIVAL,
  departure: emptyLeg(),
};

const LOOKUP: FlightLookupResult = {
  departureAirport: { iata: "EWR", name: "Newark" },
  departureTime: "2026-09-18T07:00:00.000Z",
  arrivalAirport: { iata: "BCN", name: "Barcelona" },
  arrivalTime: "2026-09-18T15:40:00.000Z",
};

const OVERNIGHT: FlightLookupResult = {
  ...LOOKUP,
  departureTime: "2026-09-18T23:30:00.000Z",
  arrivalTime: "2026-09-19T07:15:00.000Z",
};

describe("validateNewTravel", () => {
  it("accepts one filled direction and one untouched", () => {
    expect(validateNewTravel(VALID)).toEqual({});
  });

  it("requires who", () => {
    expect(validateNewTravel({ ...VALID, memberId: "" }).memberId).toBeTruthy();
  });

  it("requires day, time, and where on a direction that was started", () => {
    const errors = validateNewTravel({
      ...VALID,
      arrival: { ...ARRIVAL, location: "  " },
    });
    expect(errors.arrival?.location).toBeTruthy();
  });

  it("requires the day when a time was given without one", () => {
    const errors = validateNewTravel({
      ...VALID,
      arrival: { ...ARRIVAL, day: "" },
    });
    expect(errors.arrival?.day).toBeTruthy();
  });

  it("requires the time when a day was given without one", () => {
    const errors = validateNewTravel({
      ...VALID,
      arrival: { ...ARRIVAL, time: "" },
    });
    expect(errors.arrival?.time).toBeTruthy();
  });

  it("asks nothing of an untouched direction", () => {
    expect(validateNewTravel({ ...VALID, arrival: emptyLeg() })).toEqual({});
  });
});

describe("legFromLookup", () => {
  it("fills the pertinent pair on the leg's own day", () => {
    const leg = legFromLookup(emptyLeg(), "arrival", LOOKUP, "UA 1842", null);
    expect(leg.flightNumber).toBe("UA 1842");
    expect(leg.location).toBe("Barcelona (BCN)");
    expect(leg.nextDay).toBe(false);
  });

  it("raises Next day when the two ends fall on different days", () => {
    expect(
      legFromLookup(emptyLeg(), "arrival", OVERNIGHT, "UA 1842", null).nextDay,
    ).toBe(true);
  });
});

describe("buildLegRecord", () => {
  it("stamps the wall clock and trims the words", () => {
    const record = buildLegRecord(
      { ...ARRIVAL, location: "  BCN T2 ", flightNumber: "", details: " " },
      "arrival",
      "t-1",
      "m-1",
      "Ana",
      0,
      "2026-09-25",
    );
    expect(record?.memberName).toBe("Ana");
    expect(record?.travelType).toBe("arrival");
    expect(record?.time).toBe("2026-09-18T15:40:00.000Z");
    expect(record?.location).toBe("BCN T2");
    expect(record?.flightNumber).toBeNull();
    expect(record?.details).toBeNull();
    expect(record?.deletedAt).toBeNull();
  });

  it("puts a Next day leg on the morning after the last day", () => {
    const record = buildLegRecord(
      { ...ARRIVAL, day: "2026-09-25", time: "23:30", nextDay: true },
      "departure",
      "t-1",
      "m-1",
      "Ana",
      0,
      "2026-09-25",
    );
    expect(record?.time).toBe("2026-09-26T23:30:00.000Z");
  });

  it("returns null for a direction that was never touched", () => {
    expect(
      buildLegRecord(emptyLeg(), "arrival", "t-1", "m-1", "Ana", 0, "2026-09-25"),
    ).toBeNull();
  });
});

describe("legFromRecord", () => {
  it("reads a red-eye home back as the last day plus Next day", () => {
    const leg = legFromRecord(
      {
        time: "2026-09-26T23:30:00.000Z",
        location: "BCN T2",
        flightNumber: null,
        details: null,
      },
      null,
      "2026-09-25",
    );
    expect(leg.day).toBe("2026-09-25");
    expect(leg.nextDay).toBe(true);
  });

  it("leaves a leg inside the trip alone", () => {
    const leg = legFromRecord(
      {
        time: "2026-09-18T15:40:00.000Z",
        location: "BCN T2",
        flightNumber: null,
        details: null,
      },
      null,
      "2026-09-25",
    );
    expect(leg.day).toBe("2026-09-18");
    expect(leg.nextDay).toBe(false);
  });
});
