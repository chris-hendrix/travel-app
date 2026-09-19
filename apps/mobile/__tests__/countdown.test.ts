import { describe, expect, it } from "vitest";
import { daysBetween, tripCountdown } from "@/lib/countdown";

const today = new Date(2026, 8, 19); // Sep 19 2026, local

describe("daysBetween", () => {
  it("counts forward and backward", () => {
    expect(daysBetween("2026-09-19", "2026-09-24")).toBe(5);
    expect(daysBetween("2026-09-24", "2026-09-19")).toBe(-5);
  });

  it("crosses a month and a year", () => {
    expect(daysBetween("2026-09-28", "2026-10-02")).toBe(4);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
  });
});

describe("tripCountdown", () => {
  it("counts days for a trip inside a fortnight", () => {
    expect(tripCountdown("2026-09-24", "2026-09-26", today)).toBe(
      "in 5 days",
    );
  });

  it("says tomorrow rather than in 1 days", () => {
    expect(tripCountdown("2026-09-20", "2026-09-21", today)).toBe("tomorrow");
  });

  it("switches to weeks, then months, as the trip recedes", () => {
    expect(tripCountdown("2026-10-24", "2026-10-26", today)).toBe("in 5 weeks");
    expect(tripCountdown("2027-01-19", "2027-01-22", today)).toBe(
      "in 4 months",
    );
  });

  it("marks a trip you are on as underway", () => {
    expect(tripCountdown("2026-09-17", "2026-09-22", today)).toBe("underway");
  });

  it("returns nothing once the trip has finished", () => {
    expect(tripCountdown("2026-07-01", "2026-07-04", today)).toBeNull();
    expect(tripCountdown("2026-09-01", "2026-09-18", today)).toBeNull();
  });

  it("still counts a trip that ends today", () => {
    expect(tripCountdown("2026-09-15", "2026-09-19", today)).toBe("underway");
  });
});
