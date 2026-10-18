import { describe, expect, it } from "vitest";
import type { FlightLookupResult } from "@journiful/shared/types";
import { TRANSPORT_MODES } from "@journiful/shared/utils";
import {
  buildLegRecord,
  duplicateReplaces,
  emptyLeg,
  farEndDay,
  legCrossesMidnight,
  legFromLookup,
  legFromRecord,
  legSummary,
  legsForMember,
  travelForMemberDirection,
  validateNewTravel,
  type NewTravelInput,
  type TravelDirection,
  type TravelLeg,
} from "@/lib/newTravel";
import { wallClock } from "@/lib/timezone";

const ARRIVAL = {
  ...emptyLeg(),
  day: "2026-09-18",
  departureTime: "07:00",
  arrivalTime: "15:40",
  location: "BCN T2",
  otherLocation: "JFK T4",
  flightNumber: "UA 1842",
};

/** The same leg overnight: left the evening before, landed at lunchtime. */
const OVERNIGHT_ARRIVAL = {
  ...ARRIVAL,
  departureTime: "22:50",
  arrivalTime: "12:30",
};

const VALID: NewTravelInput = {
  memberId: "m-1",
  arrival: ARRIVAL,
  departure: emptyLeg(),
};

const LOOKUP: FlightLookupResult = {
  departureAirport: { iata: "EWR", name: "Newark" },
  departureTime: "2026-09-18T07:00:00.000Z",
  arrivalAirport: { iata: "BCN", name: "Barcelona" },
  arrivalTime: "2026-09-18T15:40:00.000Z",
};

const OVERNIGHT: FlightLookupResult = {
  ...LOOKUP,
  departureTime: "2026-09-18T23:30:00.000Z",
  arrivalTime: "2026-09-19T07:15:00.000Z",
};

describe("validateNewTravel", () => {
  it("accepts one filled direction and one untouched", () => {
    expect(validateNewTravel(VALID)).toEqual({});
  });

  it("requires who", () => {
    expect(validateNewTravel({ ...VALID, memberId: "" }).memberId).toBeTruthy();
  });

  it("requires where on a direction that was started", () => {
    const errors = validateNewTravel({
      ...VALID,
      arrival: { ...ARRIVAL, location: "  " },
    });
    expect(errors.arrival?.location).toBeTruthy();
  });

  it("requires the day when a time was given without one", () => {
    expect(
      validateNewTravel({ ...VALID, arrival: { ...ARRIVAL, day: "" } })
        .arrival?.day,
    ).toBeTruthy();
  });

  it("requires the direction's own end, not just the far one", () => {
    const errors = validateNewTravel({
      ...VALID,
      arrival: { ...ARRIVAL, arrivalTime: "" },
    });
    expect(errors.arrival?.arrivalTime).toBeTruthy();
  });

  it("accepts a leg with only its own end filled in", () => {
    expect(
      validateNewTravel({
        ...VALID,
        arrival: { ...ARRIVAL, departureTime: "" },
      }),
    ).toEqual({});
  });

  it("asks nothing of an untouched direction", () => {
    expect(validateNewTravel({ ...VALID, arrival: emptyLeg() })).toEqual({});
  });
});

describe("legFromLookup", () => {
  it("fills both ends of the leg", () => {
    const leg = legFromLookup(emptyLeg(), "arrival", LOOKUP, "UA 1842", null);
    expect(leg.flightNumber).toBe("UA 1842");
    expect(leg.location).toBe("Barcelona (BCN)");
    expect(leg.otherLocation).toBe("Newark (EWR)");
    expect(leg.crossesMidnight).toBe(false);
  });

  it("pins the crossing when the two ends fall on different days", () => {
    expect(
      legFromLookup(emptyLeg(), "arrival", OVERNIGHT, "UA 1842", null)
        .crossesMidnight,
    ).toBe(true);
  });

  it("pins the crossing as false when the lookup says same day", () => {
    expect(
      legFromLookup(emptyLeg(), "arrival", LOOKUP, "UA 1842", null)
        .crossesMidnight,
    ).toBe(false);
  });
});

describe("buildLegRecord", () => {
  it("stamps both ends on the trip's own clock", () => {
    const record = buildLegRecord(
      { ...ARRIVAL, location: " BCN T2 " },
      "arrival",
      "t-1",
      "m-1",
      "Ana",
      "UTC",
    );
    expect(record?.memberName).toBe("Ana");
    expect(record?.travelType).toBe("arrival");
    expect(record?.arrivalTime).toBe("2026-09-18T15:40:00.000Z");
    expect(record?.arrivalLocation).toBe("BCN T2");
    expect(record?.departureTime).toBe("2026-09-18T07:00:00.000Z");
    expect(record?.departureLocation).toBe("JFK T4");
  });

  it("puts the far end a day back for an overnight arrival", () => {
    // Landed the 18th at lunchtime having left at 22:50: the clocks
    // alone say the departure was the 17th, with nothing to tick.
    const record = buildLegRecord(
      OVERNIGHT_ARRIVAL,
      "arrival",
      "t-1",
      "m-1",
      "Ana",
      "UTC",
    );
    expect(record?.arrivalTime).toBe("2026-09-18T12:30:00.000Z");
    expect(record?.departureTime).toBe("2026-09-17T22:50:00.000Z");
  });

  it("puts the far end a day on for a red-eye home", () => {
    const record = buildLegRecord(
      {
        ...emptyLeg(),
        day: "2026-09-25",
        departureTime: "23:30",
        arrivalTime: "07:15",
        location: "BCN T2",
      },
      "departure",
      "t-1",
      "m-1",
      "Ana",
      "UTC",
    );
    expect(record?.departureTime).toBe("2026-09-25T23:30:00.000Z");
    expect(record?.arrivalTime).toBe("2026-09-26T07:15:00.000Z");
  });

  it("returns null for a direction that was never touched", () => {
    expect(
      buildLegRecord(emptyLeg(), "arrival", "t-1", "m-1", "Ana", "UTC"),
    ).toBeNull();
  });

  it("stores the number compact, whatever the field showed", () => {
    // The row holds what the lookup asks for ("UA1842"); the space is
    // the app's, put back wherever the number is read.
    const record = buildLegRecord(
      { ...ARRIVAL, flightNumber: "ua 1842" },
      "arrival",
      "t-1",
      "m-1",
      "Ana",
      "UTC",
    );
    expect(record?.flightNumber).toBe("UA1842");
  });
});

/**
 * The mode rides **on the leg** rather than beside it: the words follow
 * it, and so does the day a hire's far end falls on. On the leg rather
 * than as a parameter of the day functions because the three that own
 * that day (`legCrossesMidnight`, `farEndDay`, `farEndNote`) are called
 * with a leg and nothing else — `wording.test.ts` included.
 */
describe("the leg's mode", () => {
  it("starts a leg nobody has set on the flight", () => {
    // The column's default, and the chip the form pre-selects. A leg
    // always has a mode: "unknown" is the state this feature
    // deliberately does not have.
    expect(emptyLeg().transportMode).toBe("flight");
  });

  it("reads a record's mode back onto the leg", () => {
    const leg = legFromRecord(
      {
        transportMode: "rental",
        departureTime: null,
        departureLocation: null,
        arrivalTime: "2026-09-18T15:40:00.000Z",
        arrivalLocation: "Valencia",
        flightNumber: null,
        details: null,
      },
      "arrival",
      "UTC",
      "2026-09-18",
      "2026-09-25",
    );
    expect(leg.transportMode).toBe("rental");
  });

  it("files the leg's mode on the record it builds", () => {
    const record = buildLegRecord(
      { ...ARRIVAL, transportMode: "train" },
      "arrival",
      "t-1",
      "m-1",
      "Ana",
      "UTC",
    );
    expect(record?.transportMode).toBe("train");
  });

  it("round-trips every mode the wire knows", () => {
    // The six are declared once in `@journiful/shared/utils`, so a
    // seventh mode arrives here as a compile error and as a failing
    // loop rather than as a leg that quietly reads back as a flight.
    for (const mode of TRANSPORT_MODES) {
      const filed = buildLegRecord(
        { ...ARRIVAL, transportMode: mode },
        "arrival",
        "t-1",
        "m-1",
        "Ana",
        "UTC",
      );
      if (!filed) throw new Error(`a ${mode} leg was not filed`);
      expect(filed.transportMode).toBe(mode);
      expect(
        legFromRecord(filed, "arrival", "UTC", "2026-09-18", "2026-09-25")
          .transportMode,
      ).toBe(mode);
    }
  });

  it("leaves the mode alone when a lookup fills the ends in", () => {
    // Only a flight is looked up, and a lookup is about the ends: the
    // mode the chips set is not the lookup's to change.
    expect(
      legFromLookup(
        { ...emptyLeg(), transportMode: "rental" },
        "arrival",
        LOOKUP,
        "UA 1842",
        null,
      ).transportMode,
    ).toBe("rental");
  });
});

/**
 * A hire's day is a journey's. Its own end is the plan at the trip — the
 * arrival on an arrival row, the departure on a departure one — so both
 * halves of the derived day are the ordinary ones: the predicate that
 * reads a crossing, and the sign that places the far end. What the mode
 * buys is a word on the far end (`lib/transportMode.ts`), not arithmetic.
 *
 * The examples below are read the way the form files a hire, in the order
 * its two ends happen: the car is collected before the row's own day, and
 * handed back after it.
 */
describe("a hire's day is a journey's", () => {
  const hire = (overrides: Partial<TravelLeg>): TravelLeg => ({
    ...emptyLeg(),
    transportMode: "rental",
    location: "Valencia",
    ...overrides,
  });

  /** A leg filed on the trip's own clock, the way the form files it. */
  const filed = (leg: TravelLeg, direction: TravelDirection) =>
    buildLegRecord(leg, direction, "t-1", "m-1", "Ana", "UTC");

  it("stamps both ends of a same-day hire on the day it was picked up", () => {
    // Collected at 10:00 and arriving at 17:00 is one day, and each end is
    // in its own column: the car is collected at the *departure* end,
    // which is the far one on this row.
    const record = filed(
      hire({ day: "2026-09-18", departureTime: "10:00", arrivalTime: "17:00" }),
      "arrival",
    );
    expect(record?.departureTime).toBe("2026-09-18T10:00:00.000Z");
    expect(record?.arrivalTime).toBe("2026-09-18T17:00:00.000Z");
  });

  it("keeps a same-day hire's return on its own day, on a departure row", () => {
    // Leaving at 10:00 and handing the car back at 17:00, on the day the
    // strip picked.
    const record = filed(
      hire({ day: "2026-09-18", departureTime: "10:00", arrivalTime: "17:00" }),
      "departure",
    );
    expect(record?.departureTime).toBe("2026-09-18T10:00:00.000Z");
    expect(record?.arrivalTime).toBe("2026-09-18T17:00:00.000Z");
  });

  it("puts a hire's pickup the evening before", () => {
    // Collected at 20:00 and arriving at 01:30: the far end — the pickup,
    // in the departure column — is the day before the row's own day.
    const record = filed(
      hire({ day: "2026-09-18", departureTime: "20:00", arrivalTime: "01:30" }),
      "arrival",
    );
    expect(record?.departureTime).toBe("2026-09-17T20:00:00.000Z");
    expect(record?.arrivalTime).toBe("2026-09-18T01:30:00.000Z");
  });

  it("lands a hire's dropoff after midnight on the next day", () => {
    // Left at 20:00 and handed back at 01:30: the far end — the dropoff,
    // in the arrival column — is the morning after.
    const record = filed(
      hire({ day: "2026-09-20", departureTime: "20:00", arrivalTime: "01:30" }),
      "departure",
    );
    expect(record?.departureTime).toBe("2026-09-20T20:00:00.000Z");
    expect(record?.arrivalTime).toBe("2026-09-21T01:30:00.000Z");
  });

  it("reads a hire written as one day back as one day", () => {
    // A record's own dates are the fact the flag carries, so a hire both
    // of whose ends are on the 18th stays on the 18th. This is the row a
    // cold-loaded panel opens.
    const leg = legFromRecord(
      {
        transportMode: "rental",
        departureTime: "2026-09-18T10:00:00.000Z",
        departureLocation: "Valencia",
        arrivalTime: "2026-09-18T17:00:00.000Z",
        arrivalLocation: "Valencia",
        flightNumber: null,
        details: null,
      },
      "arrival",
      "UTC",
      "2026-09-18",
      "2026-09-25",
    );
    expect(leg.day).toBe("2026-09-18");
    expect(leg.crossesMidnight).toBe(false);
    const refiled = filed(leg, "arrival");
    expect(refiled?.departureTime).toBe("2026-09-18T10:00:00.000Z");
    expect(refiled?.arrivalTime).toBe("2026-09-18T17:00:00.000Z");
  });

  it("re-derives a hire's far end to one day out on save", () => {
    // The form cannot create a hire longer than a day — the far end has
    // no day picker of its own (D4) — but a record written outside it
    // can. Opening one and saving it collapses the far end to the
    // adjacent day, which for a pickup behind an arrival is the day
    // before. Pinned rather than left to be discovered.
    const leg = legFromRecord(
      {
        transportMode: "rental",
        departureTime: "2026-09-20T10:00:00.000Z",
        departureLocation: "Valencia",
        arrivalTime: "2026-09-18T10:00:00.000Z",
        arrivalLocation: "Valencia",
        flightNumber: null,
        details: null,
      },
      "arrival",
      "UTC",
      "2026-09-18",
      "2026-09-25",
    );
    expect(leg.day).toBe("2026-09-18");
    // The two ends really are on different days, so the flag is a stated
    // fact rather than the predicate's answer.
    expect(leg.crossesMidnight).toBe(true);
    expect(filed(leg, "arrival")?.departureTime).toBe(
      "2026-09-17T10:00:00.000Z",
    );
  });

  it("reads a train's red-eye as it always has", () => {
    // The control: what a hire now shares with every other mode, and what
    // the hire's own reading used to differ from.
    const record = filed(
      {
        ...emptyLeg(),
        transportMode: "train",
        day: "2026-09-25",
        departureTime: "23:30",
        arrivalTime: "07:15",
        location: "BCN Sants",
      },
      "departure",
    );
    expect(record?.departureTime).toBe("2026-09-25T23:30:00.000Z");
    expect(record?.arrivalTime).toBe("2026-09-26T07:15:00.000Z");
  });
});

describe("the hire's far end, in days", () => {
  const hire = (overrides: Partial<TravelLeg>): TravelLeg => ({
    ...emptyLeg(),
    transportMode: "rental",
    ...overrides,
  });

  it("runs back from an arrival, where the car was collected", () => {
    expect(
      farEndDay(
        hire({
          day: "2026-09-18",
          departureTime: "20:00",
          arrivalTime: "01:30",
        }),
        "arrival",
      ),
    ).toBe("2026-09-17");
  });

  it("runs forward from a departure, where it is handed back", () => {
    expect(
      farEndDay(
        hire({
          day: "2026-09-20",
          departureTime: "20:00",
          arrivalTime: "01:30",
        }),
        "departure",
      ),
    ).toBe("2026-09-21");
  });

  it("is the leg's own day when the hire's two ends are one day", () => {
    // Saying "the day after" under a field that is on the same day is the
    // noise `farEndNote` already refuses to make.
    expect(
      farEndDay(
        hire({
          day: "2026-09-18",
          departureTime: "10:00",
          arrivalTime: "17:00",
        }),
        "arrival",
      ),
    ).toBe("2026-09-18");
  });

  it("leaves a flight's far end where the two clocks put it", () => {
    // The mode has no say in the day at all: a flight's far end lands
    // where its own clocks say, which is now the whole of the rule.
    expect(
      farEndDay(
        {
          ...emptyLeg(),
          day: "2026-09-18",
          departureTime: "22:50",
          arrivalTime: "12:30",
        },
        "arrival",
      ),
    ).toBe("2026-09-17");
    expect(
      farEndDay(
        {
          ...emptyLeg(),
          day: "2026-09-25",
          departureTime: "23:30",
          arrivalTime: "07:15",
        },
        "departure",
      ),
    ).toBe("2026-09-26");
  });
});

describe("legSummary", () => {
  it("is empty for a direction nobody has filled in", () => {
    expect(legSummary(emptyLeg(), "arrival")).toBe("");
  });

  it("reads the direction's own end, and no zone", () => {
    // The zone belongs to the screen, not to the row: repeating it here
    // would be the sixth time it was said on one screen.
    expect(legSummary(ARRIVAL, "arrival")).toBe(
      "Fri Sep 18 · 3:40 PM · BCN T2",
    );
  });

  it("states this direction's own day, not the day its far end lands", () => {
    expect(
      legSummary(
        {
          ...emptyLeg(),
          day: "2026-09-25",
          departureTime: "23:30",
          arrivalTime: "07:15",
          location: "BCN T2",
        },
        "departure",
      ),
    ).toBe("Fri Sep 25 · 11:30 PM · BCN T2");
  });
});

describe("legFromRecord", () => {
  it("reads a red-eye home back as the last day plus the flag", () => {
    const leg = legFromRecord(
      {
        transportMode: "flight",
        departureTime: "2026-09-25T23:30:00.000Z",
        departureLocation: "BCN T2",
        arrivalTime: "2026-09-26T07:15:00.000Z",
        arrivalLocation: "JFK T4",
        flightNumber: null,
        details: null,
      },
      "departure",
      null,
      "2026-09-18",
      "2026-09-25",
    );
    expect(leg.day).toBe("2026-09-25");
    expect(leg.crossesMidnight).toBe(true);
    // Both ends, from the side each belongs to. Reading them by position
    // put a departure's own time in its arrival field, and the form then
    // showed 09:15 for a 23:30 flight.
    expect(leg.departureTime).toBe(
      wallClock("2026-09-25T23:30:00.000Z", null).clock,
    );
    expect(leg.arrivalTime).toBe(
      wallClock("2026-09-26T07:15:00.000Z", null).clock,
    );
  });

  it("reads an arrival's own end as the arrival", () => {
    const leg = legFromRecord(
      {
        transportMode: "flight",
        departureTime: "2026-09-18T07:00:00.000Z",
        departureLocation: "JFK T4",
        arrivalTime: "2026-09-18T15:40:00.000Z",
        arrivalLocation: "BCN T2",
        flightNumber: null,
        details: null,
      },
      "arrival",
      null,
      "2026-09-18",
      "2026-09-25",
    );
    expect(leg.arrivalTime).toBe(
      wallClock("2026-09-18T15:40:00.000Z", null).clock,
    );
    expect(leg.departureTime).toBe(
      wallClock("2026-09-18T07:00:00.000Z", null).clock,
    );
    expect(leg.otherLocation).toBe("JFK T4");
  });

  it("leaves a leg inside the trip alone", () => {
    const leg = legFromRecord(
      {
        transportMode: "flight",
        departureTime: null,
        departureLocation: null,
        arrivalTime: "2026-09-18T15:40:00.000Z",
        arrivalLocation: "BCN T2",
        flightNumber: null,
        details: null,
      },
      "arrival",
      null,
      "2026-09-18",
      "2026-09-25",
    );
    expect(leg.day).toBe("2026-09-18");
    // No far end on the record, so there is nothing to pin: it stays
    // underived, and the effective answer is still "does not cross".
    expect(leg.crossesMidnight).toBeNull();
    expect(legCrossesMidnight(leg)).toBe(false);
    expect(leg.location).toBe("BCN T2");
  });

  it("keeps an arrival filed the evening before on its margin day", () => {
    // The margin exists for this: a leg's day is about the trip rather
    // than bounded by it. Clamping the read to the trip's own bounds
    // selected the *last* day of the trip for a flight that lands the
    // evening before, and saving it then moved the arrival a week.
    const leg = legFromRecord(
      {
        transportMode: "flight",
        departureTime: "2026-09-17T17:00:00.000Z",
        departureLocation: "JFK T4",
        arrivalTime: "2026-09-17T20:30:00.000Z",
        arrivalLocation: "BCN T2",
        flightNumber: null,
        details: null,
      },
      "arrival",
      null,
      "2026-09-18",
      "2026-09-25",
    );
    expect(leg.day).toBe("2026-09-17");
  });

  it("keeps a departure filed the morning after on its margin day", () => {
    const leg = legFromRecord(
      {
        transportMode: "flight",
        departureTime: "2026-09-26T09:00:00.000Z",
        departureLocation: "BCN T2",
        arrivalTime: null,
        arrivalLocation: null,
        flightNumber: null,
        details: null,
      },
      "departure",
      null,
      "2026-09-18",
      "2026-09-25",
    );
    expect(leg.day).toBe("2026-09-26");
  });

  it("pulls a day off the strip to the nearest cell there is", () => {
    // A record hand-written, or filed while the margin was smaller: no
    // cell can show the day, so it lands on the strip's own edge rather
    // than on a day the form cannot mark.
    const before = legFromRecord(
      {
        transportMode: "flight",
        departureTime: null,
        departureLocation: null,
        arrivalTime: "2026-08-01T12:00:00.000Z",
        arrivalLocation: "BCN T2",
        flightNumber: null,
        details: null,
      },
      "arrival",
      null,
      "2026-09-18",
      "2026-09-25",
    );
    expect(before.day).toBe("2026-09-16");

    const after = legFromRecord(
      {
        transportMode: "flight",
        departureTime: "2026-11-01T12:00:00.000Z",
        departureLocation: "BCN T2",
        arrivalTime: null,
        arrivalLocation: null,
        flightNumber: null,
        details: null,
      },
      "departure",
      null,
      "2026-09-18",
      "2026-09-25",
    );
    expect(after.day).toBe("2026-09-27");
  });

  it("reads a stored number back in the field's own shape", () => {
    // Built compact, shown spaced: `buildLegRecord` and this are the two
    // ends of that, and a record that came from the API is compact.
    const leg = legFromRecord(
      {
        transportMode: "flight",
        departureTime: null,
        departureLocation: null,
        arrivalTime: "2026-09-18T15:40:00.000Z",
        arrivalLocation: "BCN T2",
        flightNumber: "UA1842",
        details: null,
      },
      "arrival",
      null,
      "2026-09-18",
      "2026-09-25",
    );
    expect(leg.flightNumber).toBe("UA 1842");
  });
});

describe("travelForMemberDirection", () => {
  const row = (
    id: string,
    memberId: string,
    travelType: "arrival" | "departure",
  ) => ({ id, memberId, travelType });

  it("returns the member's record for the direction", () => {
    const records = [
      row("depart", "m-1", "departure"),
      row("other", "m-3", "arrival"),
      row("mine", "m-1", "arrival"),
    ];
    expect(travelForMemberDirection(records, "m-1", "arrival")?.id).toBe(
      "mine",
    );
  });

  it("ignores another member's record for the same direction", () => {
    expect(
      travelForMemberDirection([row("a", "m-2", "arrival")], "m-1", "arrival"),
    ).toBeUndefined();
  });

  it("ignores the other direction for the same member", () => {
    expect(
      travelForMemberDirection(
        [row("a", "m-1", "departure")],
        "m-1",
        "arrival",
      ),
    ).toBeUndefined();
  });

  it("returns undefined for no member", () => {
    expect(
      travelForMemberDirection([row("a", "m-1", "arrival")], "", "arrival"),
    ).toBeUndefined();
  });

  it("returns the first row when a pair holds two", () => {
    // No tie-break exists — the store's order is the order the API
    // returned — so this pins the selector as deterministic given an
    // order. Keeping the pair unique is phase 2's upsert, not a
    // tie-break here.
    const records = [
      row("first", "m-1", "arrival"),
      row("second", "m-1", "arrival"),
    ];
    expect(travelForMemberDirection(records, "m-1", "arrival")?.id).toBe(
      "first",
    );
  });
});

describe("legsForMember", () => {
  const row = (
    id: string,
    memberId: string,
    travelType: TravelDirection,
  ) => ({ id, memberId, travelType });

  /** A stand-in for legFromRecord: the direction is enough to tell them apart. */
  const read = (_record: unknown, direction: TravelDirection): TravelLeg => ({
    ...emptyLeg(),
    day: direction === "arrival" ? "2026-09-18" : "2026-09-25",
    location: `from ${direction}`,
  });

  it("reads each direction's own record", () => {
    const legs = legsForMember(
      [row("a", "m-1", "arrival")],
      undefined,
      "m-1",
      read,
    );
    expect(legs.arrival.location).toBe("from arrival");
    // Nothing filed the other way: empty, not the arrival again.
    expect(legs.departure.location).toBe("");
  });

  it("prefers the record over the seed for a direction the seed does not hold", () => {
    // A seed picks up one direction from the record it was built from — a
    // departure-only leg leaves the arrival's own end empty — and an empty
    // leg is not an answer: the member's own record fills that direction,
    // while the seed keeps the direction it does hold.
    const seed = {
      arrival: { ...emptyLeg(), location: "seeded arrival" },
      departure: {
        ...emptyLeg(),
        day: "2026-09-25",
        departureTime: "09:00",
        location: "seeded departure",
      },
    };
    const legs = legsForMember(
      [row("a", "m-1", "arrival")],
      seed,
      "m-1",
      read,
    );
    expect(legs.arrival.location).toBe("from arrival");
    expect(legs.departure.location).toBe("seeded departure");
  });

  it("prefers the seed over the record for a direction the seed holds", () => {
    // The duplicate's rule, and the press's own meaning: the leg being
    // filed is the seed's, so a member who already has that leg is about
    // to have it replaced rather than read back at itself (which is what
    // the record-first rule did, and it filed nothing).
    const seed = {
      arrival: {
        ...emptyLeg(),
        day: "2026-09-18",
        arrivalTime: "15:40",
        location: "seeded arrival",
      },
    };
    const legs = legsForMember(
      [row("a", "m-1", "arrival")],
      seed,
      "m-1",
      read,
    );
    expect(legs.arrival.location).toBe("seeded arrival");
    // The direction the seed does not hold is untouched: duplicating an
    // arrival leaves the member's own departure alone.
    expect(legs.departure.location).toBe("");
  });

  it("tells the screen which directions a duplicate replaces", () => {
    const seed = {
      arrival: {
        ...emptyLeg(),
        day: "2026-09-18",
        arrivalTime: "15:40",
        location: "seeded arrival",
      },
      departure: {
        ...emptyLeg(),
        day: "2026-09-25",
        departureTime: "09:00",
        location: "seeded departure",
      },
    };
    // Their arrival is the one the seed lands on; nothing is filed the
    // other way, and an unfiled direction is not a replacement.
    expect(
      duplicateReplaces([row("a", "m-1", "arrival")], seed, "m-1"),
    ).toEqual(["arrival"]);
    // Both ends of the leg land on both of theirs: the sentence names two
    // directions rather than one, which is what the form's own wording
    // has to hold.
    expect(
      duplicateReplaces(
        [row("a", "m-1", "arrival"), row("b", "m-1", "departure")],
        seed,
        "m-1",
      ),
    ).toEqual(["arrival", "departure"]);
    // A member with nothing filed: a duplicate adds, so nothing is said.
    expect(duplicateReplaces([], seed, "m-9")).toEqual([]);
    // No seed at all is every other way into the form, and none of them
    // replaces anything.
    expect(
      duplicateReplaces([row("a", "m-1", "arrival")], undefined, "m-1"),
    ).toEqual([]);
  });

  it("falls back to the seed for a member who has nothing", () => {
    const seed = {
      arrival: { ...emptyLeg(), location: "seeded arrival" },
      departure: { ...emptyLeg(), location: "seeded departure" },
    };
    const legs = legsForMember([], seed, "m-9", read);
    expect(legs.arrival.location).toBe("seeded arrival");
    expect(legs.departure.location).toBe("seeded departure");
  });

  it("returns empty legs for a member with neither a record nor a seed", () => {
    expect(legsForMember([], undefined, "m-9", read)).toEqual({
      arrival: emptyLeg(),
      departure: emptyLeg(),
    });
  });

  it("never leaks another member's leg", () => {
    const legs = legsForMember(
      [row("a", "m-2", "arrival")],
      undefined,
      "m-1",
      read,
    );
    expect(legs.arrival.location).toBe("");
    expect(legs.departure.location).toBe("");
  });

  it("is stable across calls for the same member", () => {
    // The form calls this on every `Who` change; a rule that accumulated
    // state would leave a leg behind from the last member.
    const records = [row("a", "m-1", "arrival")];
    expect(legsForMember(records, undefined, "m-1", read)).toEqual(
      legsForMember(records, undefined, "m-1", read),
    );
  });
});
