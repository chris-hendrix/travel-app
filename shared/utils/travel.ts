import type { FlightLookupResult } from "../schemas/flight.js";

export type MemberTravelType = "arrival" | "departure";

/**
 * The six ways a leg can be taken, in the order the chips offer them.
 *
 * Declared once, in the travel module every consumer already imports:
 * `shared/schemas/member-travel.ts` builds its request and entity enums
 * from this array, the API's `member_travel_transport_mode` column reads
 * it, and the mobile's label table is keyed by it — so no two of them can
 * disagree about the six or their order.
 *
 * `flight` leads because it is the column's default and the one mode
 * whose number is looked up rather than typed.
 *
 * The field is `transportMode`, never `TravelMode`: that name was the
 * deleted field-visibility toggle, and the two must not be confused by
 * the next reader who greps for "mode".
 */
export const TRANSPORT_MODES = [
  "flight",
  "train",
  "bus",
  "car",
  "rental",
  "other",
] as const;

/** One of the six ways a leg can be taken. */
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export interface FlightAutofillFields {
  departureTime?: string | undefined;
  departureLocation?: string | undefined;
  arrivalTime?: string | undefined;
  arrivalLocation?: string | undefined;
  flightNumber?: string | undefined;
}

function formatAirport(airport: { iata: string | null; name: string }): string {
  return airport.iata ? `${airport.name} (${airport.iata})` : airport.name;
}

/**
 * Splits a flight-lookup result into form fields by travel direction.
 * Returns the full set; callers bind the pertinent pair to visible fields
 * and keep the counterpart pair in hidden form state for silent persistence.
 *
 * - arrival record: arrival side is shown, departure side hidden
 * - departure record: departure side is shown, arrival side hidden
 */
export function applyFlightLookup(
  _travelType: MemberTravelType,
  result: FlightLookupResult,
  flightNumber: string,
): FlightAutofillFields {
  return {
    departureTime: new Date(result.departureTime).toISOString(),
    departureLocation: formatAirport(result.departureAirport),
    arrivalTime: new Date(result.arrivalTime).toISOString(),
    arrivalLocation: formatAirport(result.arrivalAirport),
    flightNumber: flightNumber || undefined,
  };
}

/** Pertinent (visible) time for a travel record by its type. */
export function getPertinentTime(travel: {
  travelType: MemberTravelType;
  arrivalTime: Date | string | null;
  departureTime: Date | string | null;
}): Date | string | null {
  return travel.travelType === "arrival"
    ? travel.arrivalTime
    : travel.departureTime;
}

/** Pertinent (visible) location for a travel record by its type. */
export function getPertinentLocation(travel: {
  travelType: MemberTravelType;
  arrivalLocation: string | null;
  departureLocation: string | null;
}): string | null {
  return travel.travelType === "arrival"
    ? travel.arrivalLocation
    : travel.departureLocation;
}

/** Counterpart (hidden, lookup-set) time for a travel record by its type. */
export function getCounterpartTime(travel: {
  travelType: MemberTravelType;
  arrivalTime: Date | string | null;
  departureTime: Date | string | null;
}): Date | string | null {
  return travel.travelType === "arrival"
    ? travel.departureTime
    : travel.arrivalTime;
}

/** Counterpart (hidden, lookup-set) location for a travel record by its type. */
export function getCounterpartLocation(travel: {
  travelType: MemberTravelType;
  arrivalLocation: string | null;
  departureLocation: string | null;
}): string | null {
  return travel.travelType === "arrival"
    ? travel.departureLocation
    : travel.arrivalLocation;
}

/**
 * How many locations the `Where` field's cross-trip source serves, at
 * most — the answer's cap, not a read's bound.
 */
export const MY_TRAVEL_LOCATIONS_LIMIT = 20;

/**
 * The distinct wheres a set of travel rows holds, newest first.
 *
 * One rule in one place, because two surfaces answer it: `GET
 * /member-travel/locations`, which reads the caller's rows across trips,
 * and the demo adapter that stands in for that endpoint with no network
 * under it. Deduped case-insensitively — "BCN T2" and "bcn t2" are one
 * airport — trimmed, capped, and ordered by `updatedAt` descending, which
 * is what decides which spelling of a duplicated where survives.
 *
 * Both ends of a leg count, and the record's own end leads its
 * counterpart: the end the member filed, before the one a lookup filled
 * in silently. A row with no usable end contributes nothing and does not
 * consume the cap, which is why the cap counts locations rather than
 * rows.
 *
 * Order-owning on purpose: a caller may hand rows over in any order, so
 * the one that can only sort in SQL and the one that only has an array
 * cannot disagree about what "newest first" means. The sort is stable,
 * so rows sharing an `updatedAt` keep the order they arrived in.
 */
export function rankTravelLocations(
  rows: readonly {
    travelType: MemberTravelType;
    arrivalLocation: string | null;
    departureLocation: string | null;
    updatedAt: Date | string;
  }[],
  limit: number = MY_TRAVEL_LOCATIONS_LIMIT,
): string[] {
  const newestFirst = [...rows].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );

  const seen = new Set<string>();
  const locations: string[] = [];
  for (const row of newestFirst) {
    const ends = [getPertinentLocation(row), getCounterpartLocation(row)];
    for (const end of ends) {
      const location = end?.trim();
      if (!location) continue;
      const key = location.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      locations.push(location);
      if (locations.length >= limit) return locations;
    }
  }
  return locations;
}

/** Google Maps search URL for a free-text location (keyless pattern). */
export function mapsSearchUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

// ---------------------------------------------------------------------------
// The words one leg wears
// ---------------------------------------------------------------------------

/**
 * One of the leg's two columns: the side it departs on, and the side it
 * arrives on.
 *
 * A **side**, not a direction. The two are not the same question: a
 * record's direction says which of its ends is the one it files and the
 * validator requires, and its far end is the other side. So the departure
 * side is the row's own end on a departure record and the far end on an
 * arrival one, and every word below is asked for the side it is drawn
 * beside.
 */
export type TravelSide = "departure" | "arrival";

/** The leg's two columns, one from the other. */
export function otherSide(side: TravelSide): TravelSide {
  return side === "departure" ? "arrival" : "departure";
}

/**
 * The words one leg wears, in one table, keyed by the mode and by the
 * **side** the word belongs to — and, for a hire, by which half of the row
 * is asking.
 *
 * By the side, not by the position of the field on the screen:
 * everything that says a leg's words reads them from here — the form's
 * fields and the chips above them, the board's rows, the record sheet's
 * `Fact` labels, and the calendar feed's `Open in Maps` lines — and a
 * second table beside this one is the drift this module exists to
 * prevent.
 *
 * The words are the person's, not the transport's: `Takeoff`/`Landing`
 * was considered and rejected, because `Leaves 7:00 AM` and
 * `Lands 8:40 PM` read as a sentence about somebody, which is whose
 * travel this is. They come in three families — the flight's
 * `Leaves`/`Lands`, the neutral `Departs`/`Arrives` that a train, a bus,
 * a car and anything else do, and the hire's `Pickup`/`Dropoff` — and
 * only the last is about what you do with the transport rather than
 * about the journey.
 *
 * The tables live in `shared` rather than in the app because two surfaces
 * ask them now: the app, and `GET /calendar/:token.ics`, which writes the
 * same words into an event description for a subscriber's own leg. A
 * table the API could not import would have to be copied, and a copy is a
 * second vocabulary for one end.
 */
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
 * The only words here a mode reads from outside its own row, and the only
 * ones that pair a counter with a clock rather than a journey with one.
 *
 * Read wherever that end is drawn: the form's counter field, the sheet's
 * fact for it, and the feed's `Pickup at:` / `Dropoff at:` line.
 */
const HIRE_FAR_WORDS: Record<TravelSide, string> = {
  departure: "Pickup",
  arrival: "Dropoff",
};

/**
 * The same two ends as nouns, for the sentences about an end that holds
 * no value: `No dropoff time` inside the form's open time field, and
 * `Add the pickup` over a pair the row is not about — the shape any
 * summary of a missing end wants, in the form, the sheet or the feed.
 */
const HIRE_FAR_NOUNS: Record<TravelSide, string> = {
  departure: "pickup",
  arrival: "dropoff",
};

/**
 * Where you are at an end of the leg, or from it: you leave a place and
 * arrive at one. Read by the form's `Where`, the sheet's `Fact` label and
 * the feed's `Open in Maps` line — one preposition, three renderings.
 */
const WHERE_PREPOSITION: Record<TravelSide, string> = {
  departure: "from",
  arrival: "at",
};

/** The mode's own name: the form's chip, the board's badge, the sheet's
 *  header, the feed's event title. */
const MODE_LABELS: Record<TransportMode, string> = {
  flight: "Flight",
  train: "Train",
  bus: "Bus",
  car: "Car",
  rental: "Rental",
  other: "Other",
};

/**
 * The modes the tables above have a row for — this module's one statement
 * of which modes it can read.
 */
const TABLE_MODES: ReadonlySet<string> = new Set(Object.keys(END_WORDS));

/**
 * The mode a table is read by: the one it was handed where the tables
 * have a row for it, the flight where they do not.
 *
 * **This is a deploy-window guard, not a default to store.** An EAS
 * Update lands on a phone the moment it is published while the API deploys
 * on its own schedule, so a bundle can meet an API that predates the mode:
 * the row carries no `transportMode`, the leg is handed `undefined`, and
 * every table here was indexed by it — `END_WORDS[undefined]` is
 * `undefined`, and reading `["departure"]` off that is a `TypeError`, which
 * is the travel form's white screen rather than a word that reads a little
 * oddly. The column is `NOT NULL DEFAULT 'flight'`, so the flight's row is
 * what such a leg honestly is: the reading the column's own default would
 * have given it. The same guard answers for the calendar feed, which reads
 * rows written by clients of its own age.
 *
 * It is **not** a licence to file a default. Nothing that *writes* a leg
 * may read this: the form files the mode it was handed, as it found it
 * (`newTravel.ts`'s `legFromRecord` carries it through, and a payload that
 * omits it leaves the column alone), so an absent mode stays absent rather
 * than becoming a flight on the way out.
 *
 * An absent mode is the one case this admits. `null` stays out, because a
 * record with no mode to wear is a state this feature does have — a row
 * nobody has filed, which its callers draw without a chip and without a
 * block — and that is not a flight to be read into it.
 */
function knownMode(mode: TransportMode | undefined): TransportMode {
  // The tables' own keys, rather than `mode in END_WORDS`, which answers
  // true for `constructor` and the rest of the prototype: a mode from the
  // wire may be any string at all, and a table read through the prototype
  // is the shape of hole this guard exists to close.
  return mode !== undefined && TABLE_MODES.has(mode) ? mode : "flight";
}

/** The mode's own name — the form's chip, the board's row, the sheet's
 *  header, the feed's event title. */
export function modeLabel(mode: TransportMode | undefined): string {
  return MODE_LABELS[knownMode(mode)];
}

/**
 * The end's word, on its own — what a time field is called, and the first
 * word of any line that reads a filed end back: the form's time field, the
 * sheet's fact for that end, the board's chip. Where the end is a place
 * rather than a clock, `whereLabel` below is the same word and adds the
 * preposition.
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
 * The same word where a `Where` wears it: the end and the preposition you
 * are at it. One table, two renderings — the time field is the word itself
 * — so the form's fields, the sheet's facts and the calendar feed's link
 * lines cannot title one fact twice.
 */
export function whereLabel(
  mode: TransportMode | undefined,
  side: TravelSide,
  far = false,
): string {
  // A hire's counter is *at* both its ends — the desk you collect from and
  // the desk you hand back to — where a journey leaves *from* its departure
  // end. The hire's own end is a journey's and takes the journey's
  // preposition, which is why this asks about the half rather than about
  // the mode.
  const atCounter = far && knownMode(mode) === "rental";
  const preposition = atCounter ? "at" : WHERE_PREPOSITION[side];
  return `${endLabel(mode, side, far)} ${preposition}`;
}

/**
 * The end as a noun, for the two sentences about an end that holds no
 * value: `Add the departure` over the pair the row is not about, and
 * `No departure time` inside the form's time field — which is the form's
 * two readers, and the shape any summary of a missing end on the sheet or
 * in the feed wants.
 *
 * It is the side's own name — which is why this is not a table, since every
 * mode's own end would fill it with the same six rows: the noun cannot be
 * the word above it, because "No lands time" is not English and `Add the
 * Leaves` reads as a category error. A hire's *far* end is the exception,
 * and the only one: `Pickup` and `Dropoff` are already nouns, and calling
 * that end "the departure" would put a second name for one end on a screen.
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
  direction: MemberTravelType,
): string {
  return endLabel(mode, otherSide(direction), true);
}

// ---------------------------------------------------------------------------
// The number a leg may carry
// ---------------------------------------------------------------------------

const FLIGHT_NUMBER_REGEX = /^(?:[A-Z\d]{2}\d{1,4}|[A-Z]{3}\d{1,4})$/i;

/** Compact form the API wants: spaces/hyphens stripped, uppercased. */
export function normalizeFlightNumber(value: string): string {
  return value.replace(/[\s-]+/g, "").toUpperCase();
}

/**
 * The number the way a person writes it, and the way the field's own
 * placeholder writes it: the airline code, a space, the number ("UA 1842").
 * The space is not decoration — it is where the code ends, and a run of six
 * characters gives the eye nowhere to rest.
 *
 * The code is two characters (letters and digits mix — U2, 4U) or three
 * ICAO letters, so the split is read the same way `isFlightNumber` reads
 * it, in the same order: three letters first, then two characters. That
 * order is what keeps "U2123" as U2 + 123 rather than a one-letter code
 * with a four-digit number, which is not a code at all.
 *
 * Idempotent, and total: an empty, partial or malformed value comes back
 * compact rather than rejected, because this runs on every keystroke.
 * Mid-typing "UA" is not a wrong number, it is an unfinished one — and the
 * trailing space is not added until there is a digit to put after it, so
 * the field never holds "UA " with nothing following.
 *
 * It is here rather than in the app's flight client because the calendar
 * feed writes the same number into an event's description, and one
 * number formatted two ways is the drift the words above exist to stop.
 */
export function formatFlightNumber(value: string): string {
  const compact = normalizeFlightNumber(value);
  const code = /^[A-Z]{3}/.test(compact)
    ? compact.slice(0, 3)
    : compact.slice(0, 2);
  const number = compact.slice(code.length);
  return number ? `${code} ${number}` : code;
}

/**
 * Airline code + number, the way the API wants it: "UA123". The code
 * is two characters (letters and digits mix — U2, 4U — but never
 * digits alone) or three ICAO letters, then one to four digits. The
 * alternation pins the split so a fifth digit cannot hide inside the
 * code the way `[A-Z\d]{2,3}\d{1,4}` allowed ("UA12345").
 */
export function isFlightNumber(value: string): boolean {
  const compact = normalizeFlightNumber(value.trim());
  return FLIGHT_NUMBER_REGEX.test(compact) && /[A-Z]/i.test(compact.slice(0, 2));
}
