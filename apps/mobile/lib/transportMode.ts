import type { TransportMode } from "@journiful/shared/utils";
import type { TravelDirection, TravelLeg } from "@/lib/newTravel";

/**
 * The words one leg wears, in one table, keyed by the mode and by the
 * **side** of the leg the word belongs to.
 *
 * By the side — the departure column or the arrival one — and not by the
 * position of the field on the screen, which is what makes a hire work
 * at all: on an arrival row the side the direction requires is the
 * arrival one, and its word there is `Pickup`. Everything that says a
 * leg's words reads them from here: the form's `Where` and time labels,
 * the far-end trigger's words, the detail's `Fact` labels and the chips.
 * A second table beside this one is the drift this file exists to
 * prevent.
 *
 * The words are the person's, not the transport's: `Takeoff`/`Landing`
 * was considered and rejected (`components/trip/TravelDialog.tsx`),
 * because `Leaves 7:00 AM` and `Lands 8:40 PM` read as a sentence about
 * somebody, which is whose travel this is. They come in three families —
 * the flight's `Leaves`/`Lands`, the neutral `Departs`/`Arrives` that a
 * train, a bus, a car and anything else do, and the hire's
 * `Pickup`/`Dropoff` — and only the last is about what you do with the
 * transport rather than about the journey.
 *
 * Pure, with no renderer in it: the words are the feature, so they are
 * unit-tested rather than eyeballed at 390 and 1280.
 */

/** One of the leg's two columns. */
export type TravelSide = "departure" | "arrival";

const END_WORDS: Record<TransportMode, Record<TravelSide, string>> = {
  flight: { departure: "Leaves", arrival: "Lands" },
  train: { departure: "Departs", arrival: "Arrives" },
  bus: { departure: "Departs", arrival: "Arrives" },
  // Nobody lands a car: `Leaves`/`Lands` stays the flight's, and the
  // neutral pair is what a drive, a ferry and a walk all do.
  car: { departure: "Departs", arrival: "Arrives" },
  rental: { departure: "Dropoff", arrival: "Pickup" },
  other: { departure: "Departs", arrival: "Arrives" },
};

/** Where you are at an end of the leg, or from it: you leave a place
 *  and arrive at one. */
const WHERE_PREPOSITION: Record<TravelSide, string> = {
  departure: "from",
  arrival: "at",
};

const MODE_LABELS: Record<TransportMode, string> = {
  flight: "Flight",
  train: "Train",
  bus: "Bus",
  car: "Car",
  rental: "Rental",
  other: "Other",
};

/**
 * The number's field, where the mode keeps one.
 *
 * `bus` says service rather than number because that is what a coach
 * has, and a mode absent from this table has no field at all: car,
 * rental and other are a driver's and a walker's business, and the
 * placeholder is the mode's own so the field hints at the shape it
 * wants (`UA 1842`, `TGV 8412`, `FlixBus 42`).
 *
 * `lookup` is the flight's alone: a flight number is what
 * `POST /flights/lookup` is asked about, and the times it answers with
 * are the flight's. Everything else is hand-typed.
 */
const NUMBER_FIELDS: Partial<
  Record<TransportMode, { label: string; placeholder: string; lookup: boolean }>
> = {
  flight: { label: "Flight number", placeholder: "UA 1842", lookup: true },
  train: { label: "Train number", placeholder: "TGV 8412", lookup: false },
  bus: { label: "Bus service", placeholder: "FlixBus 42", lookup: false },
};

/** The leg's two columns, one from the other. */
function otherSide(side: TravelSide): TravelSide {
  return side === "departure" ? "arrival" : "departure";
}

/**
 * The modes the tables above have a row for — this file's one statement
 * of which modes it can read.
 */
const TABLE_MODES: ReadonlySet<string> = new Set(Object.keys(END_WORDS));

/**
 * The mode a table is read by: the one it was handed where the tables
 * have a row for it, the flight where they do not.
 *
 * **This is a deploy-window guard, not a default to store.** An EAS
 * Update lands on a phone the moment it is published while the API
 * deploys on its own schedule, so a bundle can meet an API that predates
 * the mode: the row carries no `transportMode`, the leg is handed
 * `undefined`, and every table in this file was indexed by it —
 * `END_WORDS[undefined]` is `undefined`, and reading `["departure"]` off
 * that is a `TypeError`, which is the travel form's white screen rather
 * than a word that reads a little oddly. The column is
 * `NOT NULL DEFAULT 'flight'`, so the flight's row is what such a leg
 * honestly is: the reading the column's own default would have given it.
 *
 * It is **not** a licence to file a default. Nothing that *writes* a leg
 * may read this: the form files the mode it was handed, as it found it
 * (`newTravel.ts`'s `legFromRecord` carries it through, and a payload
 * that omits it leaves the column alone), so an absent mode stays absent
 * rather than becoming a flight on the way out.
 *
 * An absent mode is the one case this admits. `null` stays out, because
 * a record with no mode to wear is a state this feature does have — a
 * row nobody has filed, which its callers draw without a chip and
 * without a block — and that is not a flight to be read into it.
 */
function knownMode(mode: TransportMode | undefined): TransportMode {
  // The tables' own keys, rather than `mode in END_WORDS`, which answers
  // true for `constructor` and the rest of the prototype: a mode from the
  // wire may be any string at all, and a table read through the prototype
  // is the shape of hole this guard exists to close.
  return mode !== undefined && TABLE_MODES.has(mode) ? mode : "flight";
}

/** The mode's own name: the chip's word and the board's badge. */
export function modeLabel(mode: TransportMode | undefined): string {
  return MODE_LABELS[knownMode(mode)];
}

/**
 * The end's word, on its own — what a time field is called, and the
 * first word of the line that reads a filed far end back.
 */
export function endLabel(
  mode: TransportMode | undefined,
  side: TravelSide,
): string {
  return END_WORDS[knownMode(mode)][side];
}

/**
 * The same word where a `Where` wears it: the end and the preposition
 * you are at it. One table, two renderings — the time field is the word
 * itself — so the form and the detail cannot title one fact twice.
 */
export function whereLabel(
  mode: TransportMode | undefined,
  side: TravelSide,
): string {
  // A hire is *at* both ends — you pick the car up at the desk and drop
  // it back there — where a journey leaves *from* its departure end.
  const preposition = mode === "rental" ? "at" : WHERE_PREPOSITION[side];
  return `${endLabel(mode, side)} ${preposition}`;
}

/**
 * The word the *far* end of this row wears, from the row's own
 * direction: an arrival's far end is its departure, a departure's is its
 * arrival, and on a hire those are the dropoff and the pickup. The
 * caller knows its direction and not which column that makes the far
 * one, which is the arithmetic this keeps out of the screens.
 */
export function farEndWord(
  mode: TransportMode | undefined,
  direction: TravelDirection,
): string {
  return endLabel(mode, otherSide(direction));
}

/** The number field's label, or null where the mode keeps no number. */
export function numberLabel(mode: TransportMode | undefined): string | null {
  return NUMBER_FIELDS[knownMode(mode)]?.label ?? null;
}

/** The number field's placeholder, or null where there is no field. */
export function numberPlaceholder(
  mode: TransportMode | undefined,
): string | null {
  return NUMBER_FIELDS[knownMode(mode)]?.placeholder ?? null;
}

/** Whether the mode has a number field at all — the render gate. */
export function hasNumberField(mode: TransportMode | undefined): boolean {
  return numberLabel(mode) !== null;
}

/** Whether the number is looked up rather than typed: the flight alone. */
export function hasLookup(mode: TransportMode | undefined): boolean {
  return NUMBER_FIELDS[knownMode(mode)]?.lookup === true;
}

/**
 * Which of the leg's two pairs is read first: the row's **own** end — the
 * one its direction names, and the only one the validator asks for — or
 * the leg's **far** one, which is optional and sits behind a trigger.
 */
export type PairLead = "own" | "far";

/**
 * Which of the two pairs the form draws comes first.
 *
 * Two rules, and the four cases fall out of them:
 *
 * - **A hire is read pickup-first, whichever row it is on.** A pickup is
 *   always the arrival side's word and always the end that happens
 *   first, so a hire's *arrival-side* pair leads: on an arrival row that
 *   is the row's own pair — `Pickup at` above `Dropoff at` — and on a
 *   departure row it is the far one, which makes a hire's departure row
 *   the one row in this form whose far pair is not second.
 * - **Every other mode reads the row's own end first**, both ways round:
 *   a flight's arrival is `Lands at` above `Leaves from`, which is the
 *   order the mockup draws, and its departure is `Leaves from` above
 *   `Lands at`.
 *
 * The caller has two blocks and one question — which comes first — so
 * this answers that, and not the columns in some order of its own. The
 * pair's own order (`departure` then `arrival` for a journey) is the
 * order the *record* runs, and read as a rendering rule it puts an
 * arrival row's far pair on top, which is the mockup's flight drawn
 * backwards.
 */
export function leadingPair(
  mode: TransportMode,
  direction: TravelDirection,
): PairLead {
  if (mode === "rental") return direction === "arrival" ? "own" : "far";
  return "own";
}

/**
 * The leg under a new mode, with the number the new mode can no longer
 * keep.
 *
 * The number is the *flight's*: it is what `formatFlightNumber` formats
 * and what the lookup is asked about, so a bus typed as `FlixBus 42`
 * would show `FLI XBUS42` — and a bus has no flight number anyway. It
 * is cleared only when the mode **leaves** the flight, which is a
 * narrower rule than "is not a flight": `train` to `bus` keeps a
 * hand-typed value, and a car that becomes a flight keeps the empty
 * field it had rather than inventing a number nobody typed.
 *
 * Nothing else moves, because everything else is the leg's rather than
 * the mode's — including `crossesMidnight`, which a lookup states from
 * the record's real dates: a fact about the leg's two ends does not
 * become false because the member changed how they are travelling.
 */
export function switchLegMode(leg: TravelLeg, mode: TransportMode): TravelLeg {
  if (leg.transportMode === mode) return leg;
  const leavesFlight = leg.transportMode === "flight";
  return {
    ...leg,
    transportMode: mode,
    flightNumber: leavesFlight ? "" : leg.flightNumber,
  };
}
