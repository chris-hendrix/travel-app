/**
 * The day strip's arithmetic, which is the one part of Phase 3 a spec can
 * reach: the cells are pure, and where the strip is drawn is judged by
 * looking at it.
 */

import { describe, expect, it } from "vitest";
import { TRIP_MARGIN_DAYS, travelDayRows, travelDays } from "@/lib/travelDays";

describe("travelDays", () => {
  it("gives a one-day trip its day and two days either side", () => {
    expect(
      travelDays({ startDate: "2026-09-18", endDate: "2026-09-18" }).map(
        (day) => day.iso,
      ),
    ).toEqual([
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });

  it("gives an eight-day trip twelve cells, in order, each labelled", () => {
    const days = travelDays({
      startDate: "2026-09-18",
      endDate: "2026-09-25",
    });

    expect(days).toHaveLength(12);
    expect(days[0]).toEqual({
      iso: "2026-09-16",
      weekday: "Wed",
      day: "16",
      inTrip: false,
    });
    expect(days[2]).toEqual({
      iso: "2026-09-18",
      weekday: "Fri",
      day: "18",
      inTrip: true,
    });
    // The morning after the last night, which is what the margin is for:
    // the red-eye home lands on a day the trip does not cover.
    expect(days[10]).toEqual({
      iso: "2026-09-26",
      weekday: "Sat",
      day: "26",
      inTrip: false,
    });
    expect(days[11]).toEqual({
      iso: "2026-09-27",
      weekday: "Sun",
      day: "27",
      inTrip: false,
    });
  });

  it("marks exactly the trip's own days as in the trip", () => {
    const days = travelDays({
      startDate: "2026-09-18",
      endDate: "2026-09-25",
    });

    // Two margin days, then the trip, then two more — which is the whole
    // of what `inTrip` has to say, and the strip's only way of telling
    // the reader where the trip begins and ends.
    expect(days.filter((day) => day.inTrip).map((day) => day.iso)).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
    ]);
    expect(days.slice(0, TRIP_MARGIN_DAYS).every((day) => !day.inTrip)).toBe(
      true,
    );
    expect(days.slice(-TRIP_MARGIN_DAYS).every((day) => !day.inTrip)).toBe(true);
  });

  it("walks across a month boundary", () => {
    expect(
      travelDays({ startDate: "2026-09-28", endDate: "2026-10-02" }).map(
        (day) => day.iso,
      ),
    ).toEqual([
      "2026-09-26",
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("gives a 31-day trip 35 cells, margin and all", () => {
    const days = travelDays({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    expect(days).toHaveLength(35);
    expect(days[0]!.iso).toBe("2025-12-30");
    expect(days[34]!.iso).toBe("2026-02-02");
  });

  it("returns nothing for an absent or malformed bound", () => {
    // A screen can render an empty strip; it cannot render a throw.
    expect(travelDays({ startDate: "", endDate: "2026-09-25" })).toEqual([]);
    expect(travelDays({ startDate: "2026-09-18", endDate: "25th" })).toEqual(
      [],
    );
    expect(travelDays({ startDate: "2026-9-18", endDate: "2026-09-25" })).toEqual(
      [],
    );
  });

  it("returns nothing for a reversed range, margin and all", () => {
    expect(
      travelDays({ startDate: "2026-09-25", endDate: "2026-09-18" }),
    ).toEqual([]);
  });
});

describe("travelDayRows", () => {
  const days = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      iso: `2026-09-${String(index + 1).padStart(2, "0")}`,
      weekday: "Thu",
      day: `${index + 1}`,
      inTrip: true,
    }));

  it("chunks into fives and pads the last row", () => {
    // Nine cells is an eight-day trip: five and then four. The null is
    // what keeps those four the same width as the five above them.
    const rows = travelDayRows(days(9));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(5);
    expect(rows[1]!.filter(Boolean)).toHaveLength(4);
    expect(rows[1]![4]).toBeNull();
  });

  it("pads every row to the same width", () => {
    for (const row of travelDayRows(days(32))) {
      expect(row).toHaveLength(5);
    }
  });

  it("keeps the order, and drops nothing", () => {
    const rows = travelDayRows(days(32));
    const flat = rows.flat().filter((day) => day !== null);
    expect(flat.map((day) => day!.iso)).toEqual(
      days(32).map((day) => day.iso),
    );
  });

  it("has no rows for no days", () => {
    expect(travelDayRows([])).toEqual([]);
  });
});
