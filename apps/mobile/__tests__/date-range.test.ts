import { describe, expect, it } from "vitest";
import { eachDay, formatDateRange } from "@/lib/dateRange";

describe("formatDateRange", () => {
  it("collapses a range inside one month", () => {
    expect(formatDateRange("2026-09-18", "2026-09-26")).toBe("Sep 18–26, 2026");
  });

  it("names both months when the range crosses one", () => {
    expect(formatDateRange("2026-09-28", "2026-10-03")).toBe(
      "Sep 28 – Oct 3, 2026",
    );
  });

  it("qualifies both years when the range crosses one", () => {
    expect(formatDateRange("2026-12-28", "2027-01-03")).toBe(
      "Dec 28, 2026 – Jan 3, 2027",
    );
  });

  it("handles a single-day trip", () => {
    expect(formatDateRange("2026-03-05", "2026-03-05")).toBe("Mar 5–5, 2026");
  });
});

describe("eachDay", () => {
  it("lists every date from start to end, inclusive", () => {
    expect(eachDay("2026-09-18", "2026-09-20")).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });

  it("holds a single day", () => {
    expect(eachDay("2026-09-18", "2026-09-18")).toEqual(["2026-09-18"]);
  });
});
