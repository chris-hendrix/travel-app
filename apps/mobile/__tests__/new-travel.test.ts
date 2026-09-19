import { describe, expect, it } from "vitest";
import {
  buildTravel,
  validateNewTravel,
  type NewTravelInput,
} from "@/lib/newTravel";

const VALID: NewTravelInput = {
  direction: "arrival",
  memberId: "m-1",
  day: "2026-09-18",
  time: "15:40",
  location: "BCN T2",
  flightNumber: "UA 1842",
  details: "",
};

describe("validateNewTravel", () => {
  it("accepts a complete input", () => {
    expect(validateNewTravel(VALID)).toEqual({});
  });

  it("requires who, day, time, and where", () => {
    const errors = validateNewTravel({
      ...VALID,
      memberId: "",
      day: "",
      time: "",
      location: "  ",
    });
    expect(errors.memberId).toBeTruthy();
    expect(errors.day).toBeTruthy();
    expect(errors.time).toBeTruthy();
    expect(errors.location).toBeTruthy();
  });

  it("rejects a bad clock time", () => {
    expect(validateNewTravel({ ...VALID, time: "evening" }).time).toBeTruthy();
  });

  it("leaves flight number and details optional", () => {
    expect(
      validateNewTravel({ ...VALID, flightNumber: "", details: "" }),
    ).toEqual({});
  });
});

describe("buildTravel", () => {
  it("stamps the wall clock and trims the words", () => {
    const record = buildTravel(
      { ...VALID, location: "  BCN T2 ", flightNumber: "", details: " " },
      "t-1",
      "Ana",
      0,
    );
    expect(record.memberName).toBe("Ana");
    expect(record.travelType).toBe("arrival");
    expect(record.time).toBe("2026-09-18T15:40:00.000Z");
    expect(record.location).toBe("BCN T2");
    expect(record.flightNumber).toBeNull();
    expect(record.details).toBeNull();
    expect(record.deletedAt).toBeNull();
  });
});
