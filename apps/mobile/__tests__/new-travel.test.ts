import { describe, expect, it } from "vitest";
import {
  buildSectionRecord,
  emptySection,
  sectionFromLookup,
  validateNewTravel,
  type NewTravelInput,
} from "@/lib/newTravel";
import type { FlightLookupResult } from "@journiful/shared/types";

const ARRIVAL: NewTravelInput["arrival"] = {
  ...emptySection(),
  enabled: true,
  day: "2026-09-18",
  time: "15:40",
  location: "BCN T2",
  flightNumber: "UA 1842",
  details: "",
};

const VALID: NewTravelInput = {
  memberId: "m-1",
  arrival: ARRIVAL,
  departure: emptySection(),
};

const LOOKUP: FlightLookupResult = {
  departureAirport: { iata: "EWR", name: "Newark" },
  departureTime: "2026-09-18T07:00:00.000Z",
  arrivalAirport: { iata: "BCN", name: "Barcelona" },
  arrivalTime: "2026-09-18T15:40:00.000Z",
};

describe("validateNewTravel", () => {
  it("accepts one ticked direction and one unticked", () => {
    expect(validateNewTravel(VALID)).toEqual({});
  });

  it("requires who", () => {
    expect(validateNewTravel({ ...VALID, memberId: "" }).memberId).toBeTruthy();
  });

  it("requires day, time, and where on a ticked section", () => {
    const errors = validateNewTravel({
      ...VALID,
      arrival: { ...ARRIVAL, day: "", time: "", location: "  " },
    });
    expect(errors.arrival?.day).toBeTruthy();
    expect(errors.arrival?.time).toBeTruthy();
    expect(errors.arrival?.location).toBeTruthy();
  });

  it("asks nothing of an unticked section", () => {
    expect(
      validateNewTravel({ ...VALID, arrival: emptySection() }),
    ).toEqual({});
  });
});

describe("sectionFromLookup", () => {
  it("fills the pertinent pair and ticks the section", () => {
    const section = sectionFromLookup(
      emptySection(),
      "arrival",
      LOOKUP,
      "UA 1842",
      null,
    );
    expect(section.enabled).toBe(true);
    expect(section.flightNumber).toBe("UA 1842");
    expect(section.day).toBe("2026-09-18");
    expect(section.location).toBe("Barcelona (BCN)");
  });
});

describe("buildSectionRecord", () => {
  it("stamps the wall clock and trims the words", () => {
    const record = buildSectionRecord(
      { ...ARRIVAL, location: "  BCN T2 ", flightNumber: "", details: " " },
      "arrival",
      "t-1",
      "m-1",
      "Ana",
      0,
    );
    expect(record?.memberName).toBe("Ana");
    expect(record?.travelType).toBe("arrival");
    expect(record?.time).toBe("2026-09-18T15:40:00.000Z");
    expect(record?.location).toBe("BCN T2");
    expect(record?.flightNumber).toBeNull();
    expect(record?.details).toBeNull();
    expect(record?.deletedAt).toBeNull();
  });

  it("returns null for an unticked section", () => {
    expect(
      buildSectionRecord(emptySection(), "arrival", "t-1", "m-1", "Ana", 0),
    ).toBeNull();
  });
});
