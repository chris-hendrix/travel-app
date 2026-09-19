import { describe, expect, it } from "vitest";
import type { MockTravel } from "@/mocks/travel";
import { travelBoard, travelRowLabel } from "@/lib/travelBoard";

function record(overrides: Partial<MockTravel> & { id: string }): MockTravel {
  return {
    memberId: overrides.id,
    memberName: overrides.id,
    travelType: "arrival",
    time: null,
    location: null,
    flightNumber: null,
    details: null,
    ...overrides,
  };
}

describe("travelBoard", () => {
  it("groups arrivals by day, morning to night", () => {
    const board = travelBoard(
      [
        record({ id: "b", time: "2026-09-18T18:15:00", memberName: "B" }),
        record({ id: "a", time: "2026-09-18T15:40:00", memberName: "A" }),
        record({ id: "c", time: "2026-09-19T10:05:00", memberName: "C" }),
      ],
      null,
    );

    expect(board.arrivals.days.map((day) => day.date)).toEqual([
      "2026-09-18",
      "2026-09-19",
    ]);
    expect(
      board.arrivals.days[0]!.rows.map((row) => row.memberName),
    ).toEqual(["A", "B"]);
  });

  it("keeps departures separate from arrivals", () => {
    const board = travelBoard(
      [
        record({ id: "a", time: "2026-09-18T15:40:00", memberName: "A" }),
        record({
          id: "d",
          travelType: "departure",
          time: "2026-09-20T09:05:00",
          memberName: "D",
        }),
      ],
      null,
    );

    expect(board.arrivals.days).toHaveLength(1);
    expect(board.departures.days.map((day) => day.date)).toEqual([
      "2026-09-20",
    ]);
  });

  it("holds untimed rows back for the foot of their section", () => {
    const board = travelBoard(
      [
        record({ id: "a", time: "2026-09-18T15:40:00", memberName: "A" }),
        record({ id: "z", time: null, memberName: "Zed" }),
        record({
          id: "y",
          travelType: "departure",
          time: null,
          memberName: "Yara",
        }),
      ],
      null,
    );

    expect(board.arrivals.days[0]!.rows.map((row) => row.memberName)).toEqual(
      ["A"],
    );
    expect(
      board.arrivals.unscheduled.map((row) => row.memberName),
    ).toEqual(["Zed"]);
    expect(
      board.departures.unscheduled.map((row) => row.memberName),
    ).toEqual(["Yara"]);
  });

  it("keeps one row per person — no flight merging", () => {
    const board = travelBoard(
      [
        record({
          id: "a",
          time: "2026-09-18T15:40:00",
          memberName: "A",
          flightNumber: "UA 1842",
        }),
        record({
          id: "b",
          time: "2026-09-18T15:40:00",
          memberName: "B",
          flightNumber: "UA 1842",
        }),
      ],
      null,
    );

    expect(board.arrivals.days[0]!.rows).toHaveLength(2);
  });
});

describe("travelRowLabel", () => {
  it("reads clock, name, flight, where", () => {
    expect(
      travelRowLabel(
        {
          id: "a",
          memberName: "Ana",
          time: "2026-09-18T15:40:00",
          location: "BCN T2",
          flightNumber: "UA 1842",
          details: null,
        },
        null,
      ),
    ).toContain("Ana");
  });
});
