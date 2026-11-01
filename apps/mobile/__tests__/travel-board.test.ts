import { describe, expect, it } from "vitest";
import type { MockTravel } from "@/mocks/travel";
import { anyTravelOwed, parsePendingRowId, pendingRowId, travelBoard, travelRowFor } from "@/lib/travelBoard";

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
    // A mode is on every record — the column's own default until somebody
    // says otherwise — and the board carries it onto the row it reads.
    transportMode: "flight",
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

  it("carries the record's mode onto the row", () => {
    // The row wears the mode as a chip, so the board has to hand it over:
    // the record's own column, and never a word derived from the location
    // or from the direction.
    const board = travelBoard(
      [
        record({
          id: "a",
          time: "2026-09-18T15:40:00",
          memberName: "Ana",
          transportMode: "rental",
        }),
        record({
          id: "d",
          travelType: "departure",
          time: "2026-09-20T09:05:00",
          memberName: "Dee",
          transportMode: "train",
        }),
      ],
      null,
    );

    expect(board.arrivals[0]!.transportMode).toBe("rental");
    expect(board.departures[0]!.transportMode).toBe("train");
  });

  it("invents no mode for a member who has filed nothing", () => {
    // A row with no record behind it is owed, not filed under some default
    // — the same reason it carries no date. The chip is on the rows where a
    // member has said how they are coming; until then the board draws
    // nothing rather than the column's default on their behalf.
    const board = travelBoard(
      [record({ id: "a", time: "2026-09-18T15:40:00", memberName: "Ana" })],
      null,
      [
        { id: "a", name: "Ana" },
        { id: "b", name: "Bea" },
      ],
    );

    expect(board.arrivals.map((row) => row.transportMode)).toEqual([
      "flight",
      null,
    ]);
  });
});

describe("travelRowFor", () => {
  const ana = { id: "9d1c7a54-1f2e-4c3b-8a5e-0b7c1d2e3f40", name: "Ana" };

  it("matches a filed row by the record's own id", () => {
    const board = travelBoard(
      [record({ id: "ana-arrival", memberId: ana.id, time: "2026-09-18T15:40:00" })],
      null,
      [ana],
    );

    expect(travelRowFor(board, "ana-arrival")?.id).toBe("ana-arrival");
  });

  it("reads an owed id forward onto the record filed since", () => {
    // The bug this helper exists for: an owed row's sheet opens the form,
    // the save files a record, and the sheet comes back to an address
    // naming the row that no longer exists. The id is a reference — a
    // member and a direction — so it resolves onto what they hold now.
    const owed = travelBoard([], null, [ana]);
    expect(travelRowFor(owed, pendingRowId("arrival", ana.id))?.time).toBeNull();

    const filed = travelBoard(
      [record({ id: "ana-arrival", memberId: ana.id, time: "2026-09-18T15:40:00" })],
      null,
      [ana],
    );

    const row = travelRowFor(filed, pendingRowId("arrival", ana.id));
    expect(row?.id).toBe("ana-arrival");
    // A filed row, not the owed one it replaced: a time and a day, which
    // a `pending-` row has neither of.
    expect(row?.time).not.toBeNull();
    expect(row?.date).not.toBeNull();
  });

  it("resolves an owed id onto the right direction only", () => {
    // Ana filed her arrival and still owes the departure, so the owed
    // departure's address must not land on the arrival beside it.
    const board = travelBoard(
      [record({ id: "ana-arrival", memberId: ana.id, time: "2026-09-18T15:40:00" })],
      null,
      [ana],
    );

    expect(
      travelRowFor(board, pendingRowId("departure", ana.id))?.travelType,
    ).toBe("departure");
  });

  it("has no row for an id that names nobody on the board", () => {
    const board = travelBoard([], null, [ana]);

    expect(travelRowFor(board, pendingRowId("arrival", "gone"))).toBeUndefined();
    expect(travelRowFor(board, "deleted-record-id")).toBeUndefined();
  });
});

describe("parsePendingRowId", () => {
  it("keeps a member id that carries dashes of its own", () => {
    // Member ids are uuids, so the prefix is matched rather than split:
    // everything after the direction is the member, dashes and all.
    expect(parsePendingRowId("pending-arrival-9d1c7a54-1f2e-4c3b")).toEqual({
      direction: "arrival",
      memberId: "9d1c7a54-1f2e-4c3b",
    });
  });

  it("is null for a record's own id", () => {
    expect(parsePendingRowId("9d1c7a54-1f2e-4c3b")).toBeNull();
    expect(parsePendingRowId("pending-arrival-")).toBeNull();
    expect(parsePendingRowId("pending-sideways-x")).toBeNull();
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
