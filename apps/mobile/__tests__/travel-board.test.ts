import { describe, expect, it } from "vitest";
import type { MockTravel } from "@/mocks/travel";
import { anyTravelOwed, travelBoard } from "@/lib/travelBoard";

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
  it("orders a direction by day, then clock, then name", () => {
    const board = travelBoard(
      [
        record({ id: "c", time: "2026-09-19T10:05:00", memberName: "Cleo" }),
        record({ id: "a", time: "2026-09-18T18:15:00", memberName: "Ana" }),
        record({ id: "b", time: "2026-09-18T15:40:00", memberName: "Bo" }),
      ],
      null,
    );

    expect(board.arrivals.map((row) => row.memberName)).toEqual([
      "Bo",
      "Ana",
      "Cleo",
    ]);
  });

  it("carries the day on every row, not on a heading", () => {
    const board = travelBoard(
      [
        record({ id: "a", time: "2026-09-18T15:40:00", memberName: "Ana" }),
        record({ id: "b", time: "2026-09-19T10:05:00", memberName: "Bo" }),
      ],
      null,
    );

    expect(board.arrivals.map((row) => row.date)).toEqual([
      "2026-09-18",
      "2026-09-19",
    ]);
  });

  it("keeps departures separate from arrivals", () => {
    const board = travelBoard(
      [
        record({ id: "a", time: "2026-09-18T15:40:00", memberName: "Ana" }),
        record({
          id: "d",
          travelType: "departure",
          time: "2026-09-20T09:05:00",
          memberName: "Dee",
        }),
      ],
      null,
    );

    expect(board.arrivals.map((row) => row.memberName)).toEqual(["Ana"]);
    expect(board.departures.map((row) => row.memberName)).toEqual(["Dee"]);
  });

  it("waits whoever shared nothing at the foot, with no day", () => {
    const board = travelBoard(
      [
        record({ id: "a", time: "2026-09-18T15:40:00", memberName: "Ana" }),
        record({ id: "z", time: null, memberName: "Zed" }),
      ],
      null,
    );

    expect(board.arrivals.map((row) => row.memberName)).toEqual([
      "Ana",
      "Zed",
    ]);
    expect(board.arrivals[1]!.date).toBeNull();
  });

  it("lists members with no record as owed, not absent", () => {
    const board = travelBoard(
      [record({ id: "a", time: "2026-09-18T15:40:00", memberName: "Ana" })],
      null,
      [
        { id: "a", name: "Ana" },
        { id: "b", name: "Bea" },
      ],
    );

    expect(board.arrivals.map((row) => row.memberName)).toEqual([
      "Ana",
      "Bea",
    ]);
    // Nobody has filed a departure, so both members are owed one: the
    // roster is the list, and a direction nobody has answered is a list
    // of everyone.
    expect(board.departures.map((row) => row.memberName)).toEqual([
      "Ana",
      "Bea",
    ]);
  });

  it("keeps one row per person — no flight merging", () => {
    const board = travelBoard(
      [
        record({
          id: "a",
          time: "2026-09-18T15:40:00",
          memberName: "Ana",
          flightNumber: "UA 1842",
        }),
        record({
          id: "b",
          time: "2026-09-18T15:40:00",
          memberName: "Bo",
          flightNumber: "UA 1842",
        }),
      ],
      null,
    );

    expect(board.arrivals).toHaveLength(2);
  });
});

describe("anyTravelOwed", () => {
  it("is true while a travelling member owes a direction", () => {
    const records = [
      // Ana has both ends; Bo has filed only an arrival; nobody has filed
      // anything for Cleo.
      record({ id: "ana-arrival", memberName: "Ana", time: "2026-09-18T15:40:00" }),
      record({
        id: "ana-departure",
        memberId: "ana-arrival",
        memberName: "Ana",
        travelType: "departure",
        time: "2026-09-25T11:00:00",
      }),
      record({ id: "bo-arrival", memberName: "Bo", time: "2026-09-18T16:10:00" }),
    ];
    const going = [
      { id: "ana-arrival", name: "Ana" },
      { id: "bo-arrival", name: "Bo" },
      { id: "cleo", name: "Cleo" },
    ];

    expect(anyTravelOwed(records, going)).toBe(true);
  });

  it("is false when every travelling member has both ends", () => {
    const records = [
      record({ id: "ana-arrival", memberName: "Ana", time: "2026-09-18T15:40:00" }),
      record({
        id: "ana-departure",
        memberId: "ana-arrival",
        memberName: "Ana",
        travelType: "departure",
        time: "2026-09-25T11:00:00",
      }),
    ];

    expect(anyTravelOwed(records, [{ id: "ana-arrival", name: "Ana" }])).toBe(
      false,
    );
  });

  it("counts nobody who is not on the travelling roster", () => {
    // The roster is the set: a member who is not going never owes a time,
    // and a trip with no travellers is not waiting on anybody.
    expect(anyTravelOwed([], [])).toBe(false);
  });
});
