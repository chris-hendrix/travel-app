import { describe, it, expect } from "vitest";
import {
  applyFlightLookup,
  getPertinentTime,
  getPertinentLocation,
  getCounterpartTime,
  getCounterpartLocation,
  rankTravelLocations,
  MY_TRAVEL_LOCATIONS_LIMIT,
  mapsSearchUrl,
  TRANSPORT_MODES,
  otherSide,
  modeLabel,
  endLabel,
  whereLabel,
  endNoun,
  farEndWord,
  normalizeFlightNumber,
  formatFlightNumber,
  isFlightNumber,
} from "../utils/travel.js";
import type { TransportMode } from "../utils/travel.js";
import type { FlightLookupResult } from "../schemas/flight.js";

const lookupResult: FlightLookupResult = {
  departureAirport: { iata: "SFO", name: "San Francisco International" },
  departureTime: "2026-07-15T14:00:00Z",
  arrivalAirport: { iata: "JFK", name: "John F. Kennedy International" },
  arrivalTime: "2026-07-15T22:30:00Z",
};

describe("applyFlightLookup", () => {
  it("should fill all four fields plus flight number", () => {
    const filled = applyFlightLookup("arrival", lookupResult, "UA123");

    expect(filled.arrivalTime).toBe(
      new Date("2026-07-15T22:30:00Z").toISOString(),
    );
    expect(filled.arrivalLocation).toBe(
      "John F. Kennedy International (JFK)",
    );
    expect(filled.departureTime).toBe(
      new Date("2026-07-15T14:00:00Z").toISOString(),
    );
    expect(filled.departureLocation).toBe(
      "San Francisco International (SFO)",
    );
    expect(filled.flightNumber).toBe("UA123");
  });

  it("should behave the same for departures (caller splits shown/hidden)", () => {
    const filled = applyFlightLookup("departure", lookupResult, "UA123");
    expect(filled.departureLocation).toBe(
      "San Francisco International (SFO)",
    );
    expect(filled.arrivalLocation).toBe(
      "John F. Kennedy International (JFK)",
    );
  });

  it("should omit IATA suffix when airport has no IATA code", () => {
    const result: FlightLookupResult = {
      ...lookupResult,
      arrivalAirport: { iata: null, name: "Small Regional Airport" },
    };
    const filled = applyFlightLookup("arrival", result, "UA123");
    expect(filled.arrivalLocation).toBe("Small Regional Airport");
  });
});

describe("pertinent/counterpart helpers", () => {
  const arrival = {
    travelType: "arrival" as const,
    arrivalTime: new Date("2026-07-15T22:30:00Z"),
    arrivalLocation: "JFK",
    departureTime: new Date("2026-07-15T14:00:00Z"),
    departureLocation: "SFO",
  };
  const departure = { ...arrival, travelType: "departure" as const };

  it("should return arrival side as pertinent for arrivals", () => {
    expect(getPertinentTime(arrival)).toBe(arrival.arrivalTime);
    expect(getPertinentLocation(arrival)).toBe("JFK");
  });

  it("should return departure side as pertinent for departures", () => {
    expect(getPertinentTime(departure)).toBe(departure.departureTime);
    expect(getPertinentLocation(departure)).toBe("SFO");
  });

  it("should return the mirror side as counterpart", () => {
    expect(getCounterpartTime(arrival)).toBe(arrival.departureTime);
    expect(getCounterpartLocation(arrival)).toBe("SFO");
    expect(getCounterpartTime(departure)).toBe(departure.arrivalTime);
    expect(getCounterpartLocation(departure)).toBe("JFK");
  });

  it("should be null-safe", () => {
    const empty = {
      travelType: "arrival" as const,
      arrivalTime: null,
      arrivalLocation: null,
      departureTime: null,
      departureLocation: null,
    };
    expect(getPertinentTime(empty)).toBeNull();
    expect(getPertinentLocation(empty)).toBeNull();
    expect(getCounterpartTime(empty)).toBeNull();
    expect(getCounterpartLocation(empty)).toBeNull();
  });
});

describe("mapsSearchUrl", () => {
  it("should build a keyless Google Maps search URL", () => {
    expect(mapsSearchUrl("JFK Airport")).toBe(
      "https://www.google.com/maps/search/?api=1&query=JFK%20Airport",
    );
  });
});

/**
 * `rankTravelLocations` is the one answer to "which wheres does this
 * person already have", and two surfaces ask it: the API endpoint that
 * reads the caller's rows across trips, and the demo adapter that stands
 * in for it offline. So this is where the rule is pinned — the callers
 * are two queries around it.
 */
describe("rankTravelLocations", () => {
  /** The two ends, the direction, and when the row was last written. */
  function row(
    updatedAt: number,
    pertinent: string | null,
    counterpart: string | null = null,
    travelType: "arrival" | "departure" = "arrival",
  ) {
    return {
      travelType,
      arrivalLocation: travelType === "arrival" ? pertinent : counterpart,
      departureLocation: travelType === "arrival" ? counterpart : pertinent,
      updatedAt: new Date(updatedAt),
    };
  }

  it("reads newest first, whatever order the rows arrive in", () => {
    const rows = [row(1_000, "Oldest"), row(3_000, "Newest"), row(2_000, "Middle")];

    expect(rankTravelLocations(rows)).toEqual(["Newest", "Middle", "Oldest"]);
  });

  it("keeps the newest spelling of a location, case-insensitively", () => {
    const rows = [row(1_000, "bcn t2"), row(2_000, "BCN T2")];

    expect(rankTravelLocations(rows)).toEqual(["BCN T2"]);
  });

  it("counts both ends of a leg, the record's own end first", () => {
    const rows = [row(1_000, "SJD T1", "SFO T2")];

    expect(rankTravelLocations(rows)).toEqual(["SJD T1", "SFO T2"]);
  });

  it("leads with the departure's own end on a departure", () => {
    const rows = [row(1_000, "LIS T1", "LIS T2", "departure")];

    expect(rankTravelLocations(rows)).toEqual(["LIS T1", "LIS T2"]);
  });

  it("trims, and drops a blank end without spending the cap on it", () => {
    const rows = [
      row(3_000, "  CDG T2  ", "   "),
      row(2_000, null, null),
      row(1_000, "CDG T1"),
    ];

    expect(rankTravelLocations(rows, 2)).toEqual(["CDG T2", "CDG T1"]);
  });

  it("caps the answer, on locations rather than rows", () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      row(1_000 + index, `Where ${index}`, null),
    );

    expect(rankTravelLocations(rows, 3)).toEqual([
      "Where 4",
      "Where 3",
      "Where 2",
    ]);
    expect(rankTravelLocations(rows, 3)).toHaveLength(3);
  });

  it("caps at the shared limit by default", () => {
    const rows = Array.from({ length: 25 }, (_, index) =>
      row(1_000 + index, `Where ${index}`),
    );

    const locations = rankTravelLocations(rows);

    expect(locations).toHaveLength(MY_TRAVEL_LOCATIONS_LIMIT);
    expect(locations[0]).toBe("Where 24");
    expect(locations).not.toContain("Where 4");
  });

  it("keeps one location from each end of a leg, once", () => {
    const rows = [
      row(2_000, "Same", "Same"),
      row(1_000, "Same", "Other"),
    ];

    expect(rankTravelLocations(rows)).toEqual(["Same", "Other"]);
  });

  it("has no answer for no rows", () => {
    expect(rankTravelLocations([])).toEqual([]);
  });
});

/**
 * The words one leg wears, pinned **here** because the table lives here
 * now: `lib/transportMode.ts` in the app re-exports these, so the form's
 * fields, the board's rows and the sheet's facts read the same strings
 * the calendar feed writes into its `Open in Maps` lines. The API cannot
 * import the app, so a table left in the app would have had to be copied,
 * and a copy is a second vocabulary for one end of one leg.
 *
 * Two rules are pinned rather than the twelve strings: every mode the
 * wire knows has a word on both ends, and one mode's two ends are two
 * different words. The three families are pinned by name afterwards —
 * the flight's `Leaves`/`Lands`, the neutral `Departs`/`Arrives` that a
 * train, a bus, a car and anything else do, and the hire's counter —
 * because those are what a reader of the app already knows. The number a
 * leg may carry travels with them: `formatFlightNumber` is what the
 * feed's description line and the form's field both wear.
 */
describe("the words one leg wears", () => {
  /** The leg's two columns, in the record's own order. */
  const SIDES = ["departure", "arrival"] as const;

  it("has a word on both ends of every mode the wire knows", () => {
    // `TRANSPORT_MODES` is the wire's own list, so a seventh mode fails
    // here rather than rendering a blank label on a phone — or, worse,
    // writing an empty line into a subscriber's calendar.
    for (const mode of TRANSPORT_MODES) {
      for (const side of SIDES) {
        expect(endLabel(mode, side).trim()).toBeTruthy();
      }
      expect(modeLabel(mode).trim()).toBeTruthy();
    }
  });

  it("gives one mode's two ends two different words", () => {
    // The side is the table's second key for a reason: one mode reading
    // the same word at both ends is a copy-paste, and a form that asks
    // `Leaves` twice tells you nothing about which clock is which.
    for (const mode of TRANSPORT_MODES) {
      expect(endLabel(mode, "departure")).not.toBe(endLabel(mode, "arrival"));
    }
  });

  it("reads a flight as the shipped words already did, and everything else as a journey's", () => {
    // `Leaves`/`Lands` read as a sentence about the person, which is
    // whose travel this is; nobody lands a car, so the neutral pair is
    // what a drive, a ferry and a walk all do.
    expect(endLabel("flight", "departure")).toBe("Leaves");
    expect(endLabel("flight", "arrival")).toBe("Lands");
    expect(modeLabel("flight")).toBe("Flight");
    for (const mode of ["train", "bus", "car", "rental", "other"] as const) {
      expect(endLabel(mode, "departure")).toBe("Departs");
      expect(endLabel(mode, "arrival")).toBe("Arrives");
    }
    expect(modeLabel("train")).toBe("Train");
    expect(modeLabel("bus")).toBe("Bus");
    expect(modeLabel("car")).toBe("Car");
    expect(modeLabel("rental")).toBe("Rental");
    expect(modeLabel("other")).toBe("Other");
  });

  it("names a hire's far end the counter's, and its own end the journey's", () => {
    // A hire is the one mode whose two ends are not both a journey's.
    // Its **own** end — the one its direction names, the one the
    // validator requires — is a journey's: you arrive at the trip and you
    // leave it. Its **far** end is the counter: the car is collected at
    // the end that came before and handed back at the end that comes
    // after, so the same departure side reads `Departs` at the own end
    // and `Pickup` at the far one.
    expect(endLabel("rental", "departure")).toBe("Departs");
    expect(endLabel("rental", "arrival")).toBe("Arrives");
    expect(endLabel("rental", "departure", true)).toBe("Pickup");
    expect(endLabel("rental", "arrival", true)).toBe("Dropoff");

    // The counter is the hire's alone: `far` changes nothing about any
    // other mode, whose far end is a departure like any other.
    for (const mode of TRANSPORT_MODES) {
      if (mode === "rental") continue;
      for (const side of SIDES) {
        expect(endLabel(mode, side, true)).toBe(endLabel(mode, side));
      }
    }
  });

  it("adds the preposition you are at an end with", () => {
    // One table, two renderings: the time field is the word itself, the
    // Where wears the word and where you are at it. The feed's lines are
    // the same two renderings, which is why the preposition lives here.
    expect(whereLabel("flight", "departure")).toBe("Leaves from");
    expect(whereLabel("flight", "arrival")).toBe("Lands at");
    expect(whereLabel("train", "departure")).toBe("Departs from");
    expect(whereLabel("train", "arrival")).toBe("Arrives at");

    // The counter is *at* both its ends — the desk you collect from and
    // the desk you hand back to — which is the one preposition a mode
    // brings of its own. A hire's own end is still a journey's.
    expect(whereLabel("rental", "departure")).toBe("Departs from");
    expect(whereLabel("rental", "arrival")).toBe("Arrives at");
    expect(whereLabel("rental", "departure", true)).toBe("Pickup at");
    expect(whereLabel("rental", "arrival", true)).toBe("Dropoff at");

    // The preposition is the whole of the difference, at every mode and
    // every half: a Where that drifts from its end's word is one fact
    // titled twice.
    for (const mode of TRANSPORT_MODES) {
      for (const side of SIDES) {
        const preposition = side === "departure" ? "from" : "at";
        expect(whereLabel(mode, side)).toBe(
          `${endLabel(mode, side)} ${preposition}`,
        );
        const farPreposition = mode === "rental" ? "at" : preposition;
        expect(whereLabel(mode, side, true)).toBe(
          `${endLabel(mode, side, true)} ${farPreposition}`,
        );
      }
    }
  });

  it("reads the far end from the direction the row files", () => {
    // An arrival row's far end is its departure — you are answering "when
    // do you land" and the takeoff is the other end — and on a hire that
    // far end is where the car was collected from. The caller knows its
    // direction and not which column that makes the far one.
    expect(farEndWord("flight", "arrival")).toBe("Leaves");
    expect(farEndWord("flight", "departure")).toBe("Lands");
    expect(farEndWord("rental", "arrival")).toBe("Pickup");
    expect(farEndWord("rental", "departure")).toBe("Dropoff");

    for (const mode of TRANSPORT_MODES) {
      for (const direction of SIDES) {
        expect(otherSide(direction)).not.toBe(direction);
        expect(farEndWord(mode, direction)).toBe(
          endLabel(mode, otherSide(direction), true),
        );
      }
    }
  });

  it("names an end as the side it is — and a hire's counter as the counter", () => {
    // The noun cannot be the word above it: `Add the Leaves` reads as a
    // category error and "No lands time" is not English. Every mode's
    // own end is the side, which is why this is a function rather than a
    // six-row table that would say the same thing six times.
    for (const mode of TRANSPORT_MODES) {
      for (const side of SIDES) expect(endNoun(mode, side)).toBe(side);
    }

    // The one exception: `Pickup` and `Dropoff` are already nouns, and
    // calling that end "the departure" would be two names for one end.
    expect(endNoun("rental", "departure", true)).toBe("pickup");
    expect(endNoun("rental", "arrival", true)).toBe("dropoff");
    for (const mode of TRANSPORT_MODES) {
      if (mode === "rental") continue;
      for (const side of SIDES) expect(endNoun(mode, side, true)).toBe(side);
    }

    // The two sentences it is for: `No … time` inside the time field,
    // and `Add the …` over the pair the row is not about.
    expect(`No ${endNoun("rental", "arrival", true)} time`).toBe(
      "No dropoff time",
    );
    expect(`No ${endNoun("flight", "departure")} time`).toBe(
      "No departure time",
    );
    expect(`Add the ${endNoun("rental", "departure", true)}`).toBe(
      "Add the pickup",
    );
    expect(`Add the ${endNoun("flight", "departure")}`).toBe(
      "Add the departure",
    );
  });

  /**
   * The deploy window. An EAS Update lands on a phone the moment it is
   * published while the API deploys on its own schedule, so a bundle can
   * read a row that predates the mode: the leg is handed `undefined`, and
   * every table here was indexed by it — `END_WORDS[undefined]` is
   * `undefined`, and reading `["departure"]` off that is a `TypeError`,
   * which is the travel form's white screen rather than a word that reads
   * a little oddly. The column is `NOT NULL DEFAULT 'flight'`, so the
   * flight's reading is what the column's own default would have said.
   *
   * It is the same guard for the calendar feed, which reads rows written
   * by clients of its own age: one old row must not put a `TypeError` in
   * a feed request.
   */
  it("reads a mode the tables have no row for as a flight", () => {
    expect(modeLabel(undefined)).toBe("Flight");
    expect(modeLabel("teleport" as TransportMode)).toBe("Flight");

    // Not just the mode's name: no table is read through an unknown mode,
    // and an unknown mode is not a hire either, so the counter's words are
    // not read into it.
    expect(endLabel(undefined, "departure")).toBe("Leaves");
    expect(endLabel("teleport" as TransportMode, "arrival")).toBe("Lands");
    expect(endLabel("teleport" as TransportMode, "departure", true)).toBe(
      "Leaves",
    );
    expect(whereLabel(undefined, "arrival")).toBe("Lands at");
    expect(whereLabel("teleport" as TransportMode, "arrival", true)).toBe(
      "Lands at",
    );
    expect(endNoun("teleport" as TransportMode, "departure", true)).toBe(
      "departure",
    );
    expect(farEndWord(undefined, "arrival")).toBe("Leaves");
    expect(farEndWord("teleport" as TransportMode, "departure")).toBe(
      "Lands",
    );
  });

  // The number a leg may carry travels with the words, and for the same
  // reason: the calendar feed writes the number into an event's
  // description, and one number formatted two ways — `UA 1842` in the
  // form's field, `UA1842` in the feed — is the drift the shared table
  // exists to stop. `lib/flights.ts` re-exports these three;
  // `lookupFlight` stays there, because a network call is not a word.

  it("compacts the number the way the API wants it", () => {
    expect(normalizeFlightNumber("UA 1842")).toBe("UA1842");
    expect(normalizeFlightNumber("ua-1842")).toBe("UA1842");
    expect(normalizeFlightNumber("UA1842")).toBe("UA1842");
    expect(normalizeFlightNumber("")).toBe("");
  });

  it("writes the number the way a person writes it", () => {
    expect(formatFlightNumber("ua1842")).toBe("UA 1842");
    expect(formatFlightNumber("UA 1842")).toBe("UA 1842");
    expect(formatFlightNumber("  ua   1842 ")).toBe("UA 1842");
    // Three letters are read as the code before two characters, so a
    // four-digit number cannot hide in the code: "U2123" is U2 + 123.
    expect(formatFlightNumber("U2123")).toBe("U2 123");
    expect(formatFlightNumber("UAL123456")).toBe("UAL 123456");
    // A bus typed as `FlixBus 42` — which is why `switchLegMode` clears
    // the number when the mode leaves the flight, and why the feed must
    // format the flight's alone.
    expect(formatFlightNumber("FlixBus 42")).toBe("FLI XBUS42");
  });

  it("formats an empty or unfinished number without rejecting it", () => {
    // This runs on every keystroke: a value mid-typing is unfinished, not
    // wrong, and the field must never hold `UA ` with nothing after it.
    expect(formatFlightNumber("")).toBe("");
    expect(formatFlightNumber("U")).toBe("U");
    expect(formatFlightNumber("UA")).toBe("UA");
    expect(formatFlightNumber("UA ")).toBe("UA");
    expect(formatFlightNumber("UAL")).toBe("UAL");
  });

  it("is idempotent", () => {
    for (const value of ["UA1842", "UAL123", "U2123", "4U123", "", "U"]) {
      expect(formatFlightNumber(formatFlightNumber(value))).toBe(
        formatFlightNumber(value),
      );
    }
  });

  it("accepts the numbers a flight can have", () => {
    for (const value of [
      "UA123",
      "UA 1842",
      "ua-1842",
      " ua1842 ",
      "BA2490",
      "U2123",
    ]) {
      expect(isFlightNumber(value)).toBe(true);
    }
  });

  it("rejects what is not a flight number", () => {
    // `UA12345` is the case the alternation exists for: a fifth digit must
    // not hide inside the code, and a code is never digits alone.
    for (const value of ["", "U", "12345", "UA12345", "UA-  ", "U A"]) {
      expect(isFlightNumber(value)).toBe(false);
    }
  });

  it("agrees with itself on what it formats", () => {
    for (const value of ["UA1842", "UAL123", "U2123", "4U123", "BA2490"]) {
      expect(isFlightNumber(formatFlightNumber(value))).toBe(true);
    }
  });
});
