import { describe, expect, it } from "vitest";
import { TRANSPORT_MODES, type TransportMode } from "@journiful/shared/utils";
import { emptyLeg, type TravelDirection, type TravelLeg } from "@/lib/newTravel";
import {
  endLabel,
  farEndWord,
  hasLookup,
  hasNumberField,
  leadingPair,
  modeLabel,
  numberLabel,
  numberPlaceholder,
  switchLegMode,
  whereLabel,
} from "@/lib/transportMode";

/** The leg's two columns, in the record's own order. */
const SIDES = ["departure", "arrival"] as const;

/**
 * The feature's one table of words, pinned here because the words *are*
 * the feature: the form's `Where` and time labels, the far-end trigger,
 * the detail's block titles and the chips all read them from
 * `lib/transportMode.ts`, and the point of the file is that no second
 * table can grow beside it and say a different thing about one leg.
 *
 * Two rules are pinned rather than the twelve strings: every mode the
 * wire knows has a word on both ends, and each mode's two words are its
 * own. The strings themselves are pinned where the plan names them —
 * the three families — and the two modes the plan does not name (`car`
 * and `other`) are pinned as the neutral pair, because a driver departs
 * and arrives and a car does not land.
 */
describe("the table of words", () => {
  it("has a word on both ends of every mode the wire knows", () => {
    // The six are declared once in `@journiful/shared/utils`; this is
    // the second consumer, so a seventh mode fails here rather than
    // rendering a blank label on a phone.
    for (const mode of TRANSPORT_MODES) {
      for (const side of SIDES) {
        expect(endLabel(mode, side).trim()).toBeTruthy();
      }
      expect(modeLabel(mode).trim()).toBeTruthy();
    }
  });

  it("gives one mode's two ends two different words", () => {
    // The end's own word is the whole reason the table is keyed by the
    // side: one mode reading the same word at both ends is a copy-paste.
    for (const mode of TRANSPORT_MODES) {
      expect(endLabel(mode, "departure")).not.toBe(endLabel(mode, "arrival"));
    }
  });

  it("reads a flight as the shipped words already did", () => {
    // `TravelDialog.tsx` argues for these two: "Leaves" and "Lands" read
    // as a sentence about the person, which is whose travel this is.
    expect(endLabel("flight", "departure")).toBe("Leaves");
    expect(endLabel("flight", "arrival")).toBe("Lands");
    expect(modeLabel("flight")).toBe("Flight");
  });

  it("reads a train and a bus as a station does", () => {
    expect(endLabel("train", "departure")).toBe("Departs");
    expect(endLabel("train", "arrival")).toBe("Arrives");
    expect(endLabel("bus", "departure")).toBe("Departs");
    expect(endLabel("bus", "arrival")).toBe("Arrives");
    expect(modeLabel("train")).toBe("Train");
    expect(modeLabel("bus")).toBe("Bus");
  });

  it("reads a hire as what you do with it", () => {
    // The hire's own words, and the reason the table is keyed by the
    // side rather than by the field's position: on an arrival row the
    // arrival side — the one the direction requires — is the pickup.
    expect(endLabel("rental", "departure")).toBe("Dropoff");
    expect(endLabel("rental", "arrival")).toBe("Pickup");
    expect(modeLabel("rental")).toBe("Rental");
  });

  it("reads a car and anything else as the neutral pair", () => {
    // Nobody lands a car: "Leaves"/"Lands" is the flight's, and the
    // neutral pair is what a drive, a ferry and a walk all do.
    for (const mode of ["car", "other"] as const) {
      expect(endLabel(mode, "departure")).toBe("Departs");
      expect(endLabel(mode, "arrival")).toBe("Arrives");
    }
    expect(modeLabel("car")).toBe("Car");
    expect(modeLabel("other")).toBe("Other");
  });

  it("gives the Where the end's word and a preposition", () => {
    // One table, two renderings: the time field is the word itself, the
    // Where takes the word and where you are at it.
    expect(whereLabel("flight", "arrival")).toBe("Lands at");
    expect(whereLabel("flight", "departure")).toBe("Leaves from");
    expect(whereLabel("train", "arrival")).toBe("Arrives at");
    expect(whereLabel("rental", "arrival")).toBe("Pickup at");
    expect(whereLabel("rental", "departure")).toBe("Dropoff at");
  });

  it("names the far end by the side it is, not by where the field sits", () => {
    // An arrival row's far end is its departure — you are answering
    // "when do you land" and the takeoff is the other end — and on a
    // hire that far end is the dropoff.
    expect(farEndWord("flight", "arrival")).toBe("Leaves");
    expect(farEndWord("flight", "departure")).toBe("Lands");
    expect(farEndWord("rental", "arrival")).toBe("Dropoff");
    expect(farEndWord("rental", "departure")).toBe("Pickup");

    for (const direction of ["arrival", "departure"] as const) {
      const far: TravelDirection = direction === "arrival" ? "departure" : "arrival";
      expect(farEndWord("bus", direction)).toBe(endLabel("bus", far));
    }
  });
});

describe("the number the mode keeps", () => {
  it("has a field for the modes that have a number", () => {
    expect(hasNumberField("flight")).toBe(true);
    expect(hasNumberField("train")).toBe(true);
    expect(hasNumberField("bus")).toBe(true);
    expect(hasNumberField("car")).toBe(false);
    expect(hasNumberField("rental")).toBe(false);
    expect(hasNumberField("other")).toBe(false);
  });

  it("looks a number up for the flight alone", () => {
    expect(hasLookup("flight")).toBe(true);
    for (const mode of TRANSPORT_MODES) {
      if (mode === "flight") continue;
      expect(hasLookup(mode)).toBe(false);
    }
  });

  it("labels the field the mode's own way", () => {
    expect(numberLabel("flight")).toBe("Flight number");
    expect(numberLabel("train")).toBe("Train number");
    expect(numberLabel("bus")).toBe("Bus service");
  });

  it("says nothing about a number a mode does not keep", () => {
    // Null rather than an empty string: a caller that renders a field
    // for a car has to have made a mistake, not received a blank.
    for (const mode of ["car", "rental", "other"] as const) {
      expect(numberLabel(mode)).toBeNull();
      expect(numberPlaceholder(mode)).toBeNull();
      expect(hasNumberField(mode)).toBe(false);
    }
  });

  it("hints at a number that looks like the one it wants", () => {
    expect(numberPlaceholder("flight")).toBe("UA 1842");
    expect(numberPlaceholder("train")).toBe("TGV 8412");
    expect(numberPlaceholder("bus")).toBe("FlixBus 42");
  });
});

describe("which of the pair leads", () => {
  /**
   * The rule, which is two rules: **a hire's arrival-side pair always
   * leads** — a pickup is the arrival side's word and is always the end
   * that happens first, whichever row the leg is read on — and **every
   * other mode reads the row's own end first**, both ways round.
   */
  it("reads a hire pickup-first, and everything else's own end first", () => {
    // rental, arrival row: the own pair *is* the pickup, so the pickup
    // reads above the dropoff.
    expect(leadingPair("rental", "arrival")).toBe("own");
    // rental, departure row: the own pair is the dropoff, so the pair
    // that leads is the far one — the pickup.
    expect(leadingPair("rental", "departure")).toBe("far");
    // flight, arrival row: the own pair is the arrival, which is the
    // mockup's `Lands at` above `Leaves from`.
    expect(leadingPair("flight", "arrival")).toBe("own");
    // flight, departure row, the same way round: the own end leads.
    expect(leadingPair("flight", "departure")).toBe("own");
  });

  it("reads every other mode as the flight reads", () => {
    for (const mode of TRANSPORT_MODES) {
      if (mode === "rental") continue;
      for (const direction of ["arrival", "departure"] as const) {
        expect(leadingPair(mode, direction)).toBe("own");
      }
    }
  });
});

/**
 * The deploy window. An EAS Update lands on a phone the moment it is
 * published while the API deploys on its own schedule, so a bundle can
 * read a record that predates the mode: the leg is handed `undefined`,
 * and the tables used to be indexed by it, which is a `TypeError` — on a
 * phone, the travel form's white screen. `transport_mode` is
 * `NOT NULL DEFAULT 'flight'`, so the flight's reading is the honest
 * degradation: what the column's own default would have said.
 *
 * Two shapes of "not a mode this bundle has": one the API does not send
 * at all, and one a newer API knows and this bundle does not. The
 * assertions are also the proof that neither throws — a throw would fail
 * the case rather than be caught by it.
 */
const NOT_A_MODE: ReadonlyArray<[string, TransportMode]> = [
  ["a mode that never arrived", undefined as unknown as TransportMode],
  ["a mode the tables have no row for", "hyperloop" as TransportMode],
];

describe.each(NOT_A_MODE)("read as a flight: %s", (_shape, mode) => {
  it("reads both ends and the Where in the flight's words", () => {
    expect(endLabel(mode, "departure")).toBe("Leaves");
    expect(endLabel(mode, "arrival")).toBe("Lands");
    expect(whereLabel(mode, "departure")).toBe("Leaves from");
    expect(whereLabel(mode, "arrival")).toBe("Lands at");
    expect(farEndWord(mode, "arrival")).toBe("Leaves");
    expect(farEndWord(mode, "departure")).toBe("Lands");
  });

  it("reads the mode's own name and its number as the flight's", () => {
    expect(modeLabel(mode)).toBe("Flight");
    expect(numberLabel(mode)).toBe("Flight number");
    expect(numberPlaceholder(mode)).toBe("UA 1842");
    expect(hasNumberField(mode)).toBe(true);
    expect(hasLookup(mode)).toBe(true);
  });

  it("leads with the row's own pair, which is what a flight does", () => {
    expect(leadingPair(mode, "arrival")).toBe("own");
    expect(leadingPair(mode, "departure")).toBe("own");
  });
});

describe("switchLegMode", () => {
  const leg = (overrides: Partial<TravelLeg>): TravelLeg => ({
    ...emptyLeg(),
    ...overrides,
  });

  it("clears the number when the mode leaves the flight", () => {
    // The number is the flight's: it is formatted as a flight's and it
    // is what the lookup is asked about, and `formatFlightNumber(
    // "FlixBus 42")` would print `FLI XBUS42`.
    const next = switchLegMode(
      leg({ transportMode: "flight", flightNumber: "UA 1842" }),
      "rental",
    );
    expect(next.transportMode).toBe("rental");
    expect(next.flightNumber).toBe("");
  });

  it("keeps a hand-typed number between two modes that are not flights", () => {
    const next = switchLegMode(
      leg({ transportMode: "train", flightNumber: "FlixBus 42" }),
      "bus",
    );
    expect(next.transportMode).toBe("bus");
    expect(next.flightNumber).toBe("FlixBus 42");
  });

  it("leaves the number empty when a car becomes a flight", () => {
    // Nothing was typed, so nothing is filled in: the flight's number is
    // the member's to type, and this is the mode change that must not
    // invent one.
    const next = switchLegMode(
      leg({ transportMode: "car", flightNumber: "" }),
      "flight",
    );
    expect(next.transportMode).toBe("flight");
    expect(next.flightNumber).toBe("");
  });

  it("keeps the number when the mode does not leave the flight", () => {
    // Flight to flight is not a departure from the mode the number
    // belongs to; the rule is "left the flight", not "was not a flight".
    const next = switchLegMode(
      leg({ transportMode: "flight", flightNumber: "UA 1842" }),
      "flight",
    );
    expect(next).toEqual(leg({ transportMode: "flight", flightNumber: "UA 1842" }));
  });

  it("touches nothing the number does not own", () => {
    // Including `crossesMidnight`: a lookup's real dates are a fact
    // about the leg's ends, not about how it is taken, and clearing it
    // would hand the derived day back to the predicate.
    const before = leg({
      transportMode: "flight",
      flightNumber: "UA 1842",
      day: "2026-09-18",
      departureTime: "22:50",
      arrivalTime: "12:30",
      crossesMidnight: true,
      location: "BCN T2",
      otherLocation: "JFK T4",
      details: "Bags take twenty minutes.",
    });
    expect(switchLegMode(before, "car")).toEqual({
      ...before,
      transportMode: "car",
      flightNumber: "",
    });
  });

  it("does not mutate the leg it was handed", () => {
    const before = leg({ transportMode: "flight", flightNumber: "UA 1842" });
    const copy = { ...before };
    switchLegMode(before, "car");
    expect(before).toEqual(copy);
  });
});
