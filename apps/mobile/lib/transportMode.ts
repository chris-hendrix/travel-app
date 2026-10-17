import type { TransportMode } from "@journiful/shared/utils";
import type { TravelDirection, TravelLeg } from "@/lib/newTravel";

/**
 * The words one leg wears, in one table, keyed by the mode and by the
 * **side** of the leg the word belongs to — and, for a hire, by which
 * half of the row is asking.
 *
 * By the side, not by the position of the field on the screen:
 * everything that says a leg's words reads them from here — the form's
 * `Where` and time labels, the far-end trigger's words, the detail's
 * `Fact` labels and the chips — and a second table beside this one is the
 * drift this file exists to prevent.
 *
 * A hire is the one mode whose two ends are not both a journey's, and it
 * is the whole reason the functions below take a `far`. Its **own** end —
 * the one its direction names, the one the validator requires, the plan
 * the group is owed — is a journey's: you arrive at the trip and you
 * leave it, so it wears the neutral pair a car wears. Its **far** end,
 * the optional one, is the counter: the car is collected at the end that
 * came before, and handed back at the end that comes after. So the side
 * alone cannot name a hire's end — the departure side reads `Departs` at
 * the own end and `Pickup` at the far one — and every word below is asked
 * for the half of the row it is about.
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
  // A hire's own end is a journey's too — arriving at the trip is
  // arriving and leaving it is leaving — so it reads as a car's does. The
  // counter's two errands are the *far* end's, and they live in
  // `HIRE_FAR_WORDS` below rather than in a row here.
  rental: { departure: "Departs", arrival: "Arrives" },
  other: { departure: "Departs", arrival: "Arrives" },
};

/**
 * The two errands a hire is not a journey for, keyed by the side they fall
 * on — which the row's direction decides. On an arrival row the far end is
 * the departure side, the end the car was collected from; on a departure
 * row it is the arrival side, the end it is handed back to.
 *
 * The only words in this file a mode reads from outside its own row, and
 * the only ones that pair a counter with a clock rather than a journey
 * with one.
 */
const HIRE_FAR_WORDS: Record<TravelSide, string> = {
  departure: "Pickup",
  arrival: "Dropoff",
};

/**
 * The same two ends as nouns, for the two sentences about an end that
 * holds no value: `Add the pickup` over a shut far pair, and `No dropoff
 * time` inside an open time field.
 */
const HIRE_FAR_NOUNS: Record<TravelSide, string> = {
  departure: "pickup",
  arrival: "dropoff",
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
 * The longest value the number field will take, and the column's own cap:
 * `flight_number` is `varchar(10)`, and the field was free to type past it
 * the moment the mode stopped being a flight.
 *
 * It lives here, beside the placeholders it constrains, because the two
 * are one invariant: a hint may not demonstrate a value the field
 * refuses. `FlixBus 042` is eleven characters, which is why the bus's
 * placeholder reads `FlixBus 42` below — and it lives here rather than in
 * the component so that `__tests__/transport-mode.test.ts` can hold every
 * placeholder under it in one assertion, the Vitest suite having no
 * renderer to import a screen with.
 */
export const NUMBER_MAX_LENGTH = 10;

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
 *
 * `far` asks for the other half of the row, which is a question only a
 * hire makes a difference to: its own end is a journey's, and `Pickup` /
 * `Dropoff` name the counter at the end the row is not about.
 */
export function endLabel(
  mode: TransportMode | undefined,
  side: TravelSide,
  far = false,
): string {
  if (far && knownMode(mode) === "rental") return HIRE_FAR_WORDS[side];
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
  far = false,
): string {
  // A hire's counter is *at* both its ends — the desk you collect from
  // and the desk you hand back to — where a journey leaves *from* its
  // departure end. The hire's own end is a journey's and takes the
  // journey's preposition, which is why this asks about the half rather
  // than about the mode.
  const atCounter = far && knownMode(mode) === "rental";
  const preposition = atCounter ? "at" : WHERE_PREPOSITION[side];
  return `${endLabel(mode, side, far)} ${preposition}`;
}

/**
 * The end as a noun, for the two sentences about an end that holds no
 * value: the shut far pair's line (`Add the departure`) and the no-choice
 * row inside a time field (`No departure time`).
 *
 * It is the side's own name — which is why this is not a table, since
 * every mode's own end would fill it with the same six rows: the noun
 * cannot be the word above it, because "No lands time" is not English and
 * `Add the Leaves` reads as a category error. A hire's *far* end is the
 * exception, and the only one: `Pickup` and `Dropoff` are already nouns,
 * and calling that end "the departure" would put a second name for one
 * end on a screen.
 */
export function endNoun(
  mode: TransportMode | undefined,
  side: TravelSide,
  far = false,
): string {
  if (far && knownMode(mode) === "rental") return HIRE_FAR_NOUNS[side];
  return side;
}

/**
 * The word the *far* end of this row wears, from the row's own direction:
 * an arrival's far end is its departure, a departure's is its arrival, and
 * on a hire those are the pickup and the dropoff. The caller knows its
 * direction and not which column that makes the far one, which is the
 * arithmetic this keeps out of the screens.
 */
export function farEndWord(
  mode: TransportMode | undefined,
  direction: TravelDirection,
): string {
  return endLabel(mode, otherSide(direction), true);
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
