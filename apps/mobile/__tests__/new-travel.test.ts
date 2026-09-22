import { describe, expect, it } from "vitest";
import type { FlightLookupResult } from "@journiful/shared/types";
import {
  buildLegRecord,
  emptyLeg,
  legCrossesMidnight,
  legFromLookup,
  legFromRecord,
  legSummary,
  validateNewTravel,
  type NewTravelInput,
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
