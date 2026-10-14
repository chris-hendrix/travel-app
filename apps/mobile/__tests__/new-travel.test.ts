import { describe, expect, it } from "vitest";
import type { FlightLookupResult } from "@journiful/shared/types";
import {
  buildLegRecord,
  emptyLeg,
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

  it("prefers the record over the seed, per direction", () => {
    const seed = {
      arrival: { ...emptyLeg(), location: "seeded" },
      departure: { ...emptyLeg(), location: "seeded" },
    };
    const legs = legsForMember(
      [row("a", "m-1", "arrival")],
      seed,
      "m-1",
      read,
    );
    expect(legs.arrival.location).toBe("from arrival");
    expect(legs.departure.location).toBe("seeded");
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
