import { describe, expect, it } from "vitest";
import type { MockTravel } from "@/mocks/travel";
import { travelBoard, travelRowLabel } from "@/lib/travelBoard";

/**
 * A record in the API's own shape: both ends exist as columns and the
 * direction decides which one is pertinent. Tests give a `time` and a
 * `location` in the direction's own terms, and this puts them on the
 * side the board will read.
 */
function record(
  overrides: Partial<MockTravel> & {
    id: string;
    time?: string | null;
    location?: string | null;
  },
): MockTravel {
  const { time = null, location = null, ...rest } = overrides;
  const travelType = rest.travelType ?? "arrival";
  return {
    memberId: overrides.id,
    memberName: overrides.id,
    travelType,
    departureTime: travelType === "departure" ? time : null,
    departureLocation: travelType === "departure" ? location : null,
    arrivalTime: travelType === "arrival" ? time : null,
    arrivalLocation: travelType === "arrival" ? location : null,
    flightNumber: null,
    details: null,
    deletedAt: null,
    ...rest,
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
  it("lists members with no record as unscheduled, not absent", () => {
    const board = travelBoard(
      [record({ id: "a", time: "2026-09-18T15:40:00", memberName: "A" })],
      null,
      [
        { id: "a", name: "A" },
        { id: "b", name: "Bea" },
      ],
    );

    expect(
      board.arrivals.unscheduled.map((row) => row.memberName),
    ).toEqual(["Bea"]);
    expect(board.departures.unscheduled.map((row) => row.memberName)).toEqual(
      ["A", "Bea"],
    );
  });
});

describe("travelRowLabel", () => {
  it("reads clock, name, flight, where", () => {
    expect(
      travelRowLabel(
        {
          id: "a",
          memberId: "a",
          memberName: "Ana",
          travelType: "arrival",
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
