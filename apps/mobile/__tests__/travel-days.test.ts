/**
 * The day strip's arithmetic, which is the one part of Phase 3 a spec can
 * reach: the cells are pure, and where the strip is drawn is judged by
 * looking at it.
 */

import { describe, expect, it } from "vitest";
import { travelDayRows, travelDays } from "@/lib/travelDays";

describe("travelDays", () => {
  it("gives a one-day trip the day and the morning after", () => {
    expect(
      travelDays({ startDate: "2026-09-18", endDate: "2026-09-18" }).map(
        (day) => day.iso,
      ),
    ).toEqual(["2026-09-18", "2026-09-19"]);
  });

  it("gives an eight-day trip nine cells, in order, each labelled", () => {
    const days = travelDays({
      startDate: "2026-09-18",
      endDate: "2026-09-25",
    });

    expect(days).toHaveLength(9);
    expect(days[0]).toEqual({ iso: "2026-09-18", weekday: "Fri", day: "18" });
    // The morning after the end, which is the cell the whole strip is
    // built around: the red-eye home has to be selectable.
    expect(days[8]).toEqual({ iso: "2026-09-26", weekday: "Sat", day: "26" });
  });

  it("walks across a month boundary", () => {
    expect(
      travelDays({ startDate: "2026-09-28", endDate: "2026-10-02" }).map(
        (day) => day.iso,
      ),
    ).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
  });

  it("gives a 31-day trip 32 cells", () => {
    expect(
      travelDays({ startDate: "2026-01-01", endDate: "2026-01-31" }),
    ).toHaveLength(32);
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

  it("returns nothing for a reversed range", () => {
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
