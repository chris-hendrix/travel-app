import { describe, expect, it } from "vitest";
import {
  addMonths,
  applyDayTap,
  applySingleTap,
  isEndpoint,
  isInRange,
  monthGrid,
  monthLabel,
  type Selection,
} from "@/lib/calendar";

describe("monthGrid", () => {
  it("starts the month on the right weekday (Monday-first)", () => {
    // Sep 1 2026 is a Tuesday, so one blank cell leads the first week.
    const weeks = monthGrid({ year: 2026, month: 8 });

    expect(weeks[0]?.[0]).toBeNull();
    expect(weeks[0]?.[1]).toBe("2026-09-01");
  });

  it("covers the whole month and pads the last week", () => {
    const weeks = monthGrid({ year: 2026, month: 8 });
    const days = weeks.flat().filter(Boolean);

    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-09-01");
    expect(days[days.length - 1]).toBe("2026-09-30");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("handles February in a leap year", () => {
    const days = monthGrid({ year: 2028, month: 1 }).flat().filter(Boolean);
    expect(days).toHaveLength(29);
    expect(days).toContain("2028-02-29");
  });
});

describe("addMonths", () => {
  it("rolls over a year boundary in both directions", () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({
      year: 2027,
      month: 0,
    });
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({
      year: 2025,
      month: 11,
    });
  });

  it("labels the month", () => {
    expect(monthLabel({ year: 2026, month: 8 })).toBe("September 2026");
  });
});

describe("applyDayTap", () => {
  const empty: Selection = { start: null, end: null };

  it("starts a range on the first tap and closes it on the second", () => {
    const started = applyDayTap(empty, "2026-09-10");
    expect(started).toEqual({ start: "2026-09-10", end: null });

    const closed = applyDayTap(started, "2026-09-14");
    expect(closed).toEqual({ start: "2026-09-10", end: "2026-09-14" });
  });

  it("restarts when the second tap is earlier", () => {
    const started: Selection = { start: "2026-09-10", end: null };
    expect(applyDayTap(started, "2026-09-04")).toEqual({
      start: "2026-09-04",
      end: null,
    });
  });

  it("starts a fresh range once one is complete", () => {
    const complete: Selection = { start: "2026-09-10", end: "2026-09-14" };
    expect(applyDayTap(complete, "2026-10-01")).toEqual({
      start: "2026-10-01",
      end: null,
    });
  });

  it("allows a single-day trip", () => {
    const started: Selection = { start: "2026-09-10", end: null };
    expect(applyDayTap(started, "2026-09-10")).toEqual({
      start: "2026-09-10",
      end: "2026-09-10",
    });
  });
});


describe("range helpers", () => {
  const selection: Selection = { start: "2026-09-10", end: "2026-09-14" };

  it("marks the days between the endpoints, not the endpoints", () => {
    expect(isInRange(selection, "2026-09-12")).toBe(true);
    expect(isInRange(selection, "2026-09-10")).toBe(false);
    expect(isInRange(selection, "2026-09-15")).toBe(false);
  });

  it("recognises endpoints", () => {
    expect(isEndpoint(selection, "2026-09-10")).toBe(true);
    expect(isEndpoint(selection, "2026-09-14")).toBe(true);
    expect(isEndpoint(selection, "2026-09-12")).toBe(false);
  });
});

describe("applySingleTap", () => {
  it("puts both ends of the selection on the one day", () => {
    expect(applySingleTap("2026-09-20")).toEqual({
      start: "2026-09-20",
      end: "2026-09-20",
    });
  });

  it("replaces a whole range with the day tapped", () => {
    const range = applyDayTap({ start: "2026-09-18", end: null }, "2026-09-22");
    expect(applySingleTap("2026-09-20")).not.toEqual(range);
    expect(applySingleTap("2026-09-20")).toEqual({
      start: "2026-09-20",
      end: "2026-09-20",
    });
  });
});
