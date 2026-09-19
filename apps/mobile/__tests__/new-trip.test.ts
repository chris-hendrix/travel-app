import { describe, expect, it } from "vitest";
import {
  buildTrip,
  isIsoDate,
  validateNewTrip,
  type NewTripInput,
} from "@/lib/newTrip";

const valid: NewTripInput = {
  title: "Los Picos Trail",
  location: "Mallorca",
  startDate: "2026-10-03",
  endDate: "2026-10-06",
};

describe("isIsoDate", () => {
  it("accepts real dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
  });

  it("rejects dates that do not exist", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
  });

  it("rejects other shapes", () => {
    expect(isIsoDate("03/10/2026")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("validateNewTrip", () => {
  it("passes a complete trip", () => {
    expect(validateNewTrip(valid)).toEqual({});
  });

  it("names the missing fields", () => {
    const errors = validateNewTrip({
      title: "  ",
      location: "",
      startDate: "",
      endDate: "",
    });

    expect(errors.title).toBeTruthy();
    expect(errors.location).toBeTruthy();
    expect(errors.startDate).toBeTruthy();
    expect(errors.endDate).toBeTruthy();
  });

  it("rejects a trip that ends before it starts", () => {
    const errors = validateNewTrip({
      ...valid,
      startDate: "2026-10-06",
      endDate: "2026-10-03",
    });

    expect(errors.endDate).toMatch(/ends before/i);
  });

  it("allows a single-day trip", () => {
    expect(
      validateNewTrip({ ...valid, endDate: valid.startDate }),
    ).toEqual({});
  });
});

describe("buildTrip", () => {
  it("trims input and seeds an image from the id", () => {
    const trip = buildTrip(
      { ...valid, title: "  Los Picos Trail  " },
      "trip-1",
    );

    expect(trip.title).toBe("Los Picos Trail");
    expect(trip.image).toContain("trip-1");
    expect(trip.going).toBe(1);
  });
});
