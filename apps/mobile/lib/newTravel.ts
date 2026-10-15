import { applyFlightLookup, type TransportMode } from "@journiful/shared/utils";
import type { FlightLookupResult } from "@journiful/shared/types";
import { addDays as shift, formatDay } from "@/lib/dateRange";
import { formatFlightNumber, normalizeFlightNumber } from "@/lib/flights";
import { formatClock, isClockTime, minutesOf } from "@/lib/time";
import { wallClock, zoneOffsetMinutes } from "@/lib/timezone";
import { TRIP_MARGIN_DAYS } from "@/lib/travelDays";
import { joinFacts } from "@/lib/wording";
import type { MockTravel } from "@/mocks/travel";

export type TravelDirection = "arrival" | "departure";

/**
 * One direction's travel as the form asks for it — a leg, with a start
 * and an end, the way a flight has both.
 *
 * `day` is the day of this direction's own event, which is the day the
 * board files: the day you land for an arrival, the day you leave for a
 * departure. Both of those fall on a day the strip can show — the trip's
 * own days, and the couple of margin days either side of it that
 * `travelDays` draws for the evening-before arrival and the red-eye home.
 *
 * The other end is not always the same day. That is not a preference to
 * ask for, it is arithmetic: an arrival earlier than its departure can
 * only mean the leg crossed midnight, because a same-day one would have
 * a negative duration. `crossesMidnight` is that sum — `null` to work it
 * out from the two times, or a fact when the source already knows it,
 * which a flight lookup does because it carries both timestamps.
 *
 * A hire is the arithmetic the other way round, and the mode on the leg
 * is what tells the two apart: see `legCrossesMidnight` and
 * `farEndShift`.
 */
export type TravelLeg = {
  day: string;
  /**
   * How the leg is taken. It rides on the leg rather than beside it:
   * the words follow it (`lib/transportMode.ts`), and so does the day
   * the far end falls on, which the three functions that own that day
   * read off the leg they were handed and nothing else.
   */
  transportMode: TransportMode;
  /** The leg's start: when it leaves. */
  departureTime: string;
  /** The leg's end: when it lands. */
  arrivalTime: string;
  /**
   * Whether the leg crosses midnight. Null derives it from the two
   * clocks; a lookup that carries real dates can state it outright.
   */
  crossesMidnight: boolean | null;
  /** Where this direction's own end is, as the member would say it. */
  location: string;
  /** The far end's location, when a lookup knew it. Never a field. */
  otherLocation: string;
  flightNumber: string;
  details: string;
};

export type NewTravelInput = {
  memberId: string;
  arrival: TravelLeg;
  departure: TravelLeg;
};

export type LegErrors = Partial<
  Record<"day" | "departureTime" | "arrivalTime" | "location", string>
>;

export type NewTravelErrors = {
  memberId?: string | undefined;
  arrival?: LegErrors | undefined;
  departure?: LegErrors | undefined;
};

export function emptyLeg(): TravelLeg {
  return {
    day: "",
    // The column's default and the chip the form pre-selects. A leg
    // always has a mode: "unknown" is one state this feature deliberately
    // does not have.
    transportMode: "flight",
    departureTime: "",
    arrivalTime: "",
    crossesMidnight: null,
    location: "",
    otherLocation: "",
    flightNumber: "",
    details: "",
  };
}

/**
 * The time the API holds as pertinent for this direction — the arrival's
 * arrival, the departure's departure. This is the half the board files
 * and sorts on; the other half is the counterpart the lookup fills in.
 */
export function pertinentClock(
  leg: TravelLeg,
  direction: TravelDirection,
): string {
  return direction === "arrival" ? leg.arrivalTime : leg.departureTime;
}

/** A direction is filed once its own end has a time: who and when. */
export function legIsFiled(
  leg: TravelLeg,
  direction: TravelDirection,
): boolean {
  return (
    Boolean(leg.day.trim()) || Boolean(pertinentClock(leg, direction).trim())
  );
}

/**
 * The live row for one member and one direction, or nothing.
 *
 * The pair is the identity the whole feature assumes — a person has at
 * most one arrival and one departure — so this is the one place that
 * lookup is written. It is a `find`, not a filter: the store's order is
 * the order the API returned, and the invariant that keeps the pair
 * unique lives on the server (the create endpoint upserts on it), not
 * in a tie-break here.
 *
 * Every record is structurally enough: both the `MockTravel` rows the
 * board reads and the wire rows behind them carry these two keys.
 */
export function travelForMemberDirection<
  T extends { memberId: string; travelType: TravelDirection },
>(
  records: readonly T[],
  memberId: string,
  direction: TravelDirection,
): T | undefined {
  if (!memberId) return undefined;
  return records.find(
    (record) =>
      record.memberId === memberId && record.travelType === direction,
  );
}

/** The directions, in the order the form shows them. */
const DIRECTIONS = ["arrival", "departure"] as const;

/**
 * The legs a duplicate carries before a recipient is picked: one per
 * direction, absent where there was nothing to copy.
 */
export type LegSeed = Partial<Record<TravelDirection, TravelLeg>>;

/**
 * The one rule for what the fields hold: the picked member's own record
 * for that direction, else the seed a duplicate arrived with, else
 * nothing.
 *
 * One rule on purpose, because each half of it alone is wrong. Reloading
 * on every `Who` change would wipe the copy the instant you chose its
 * recipient; never reloading would leave the previous person's leg in
 * the fields when you switched away, which files one person's times
 * under another's name — and `filed`, and therefore Delete, still
 * pointing at the member you started on.
 *
 * `read` turns a record into a leg — `legFromRecord` in the app, a
 * one-liner in the tests — so this stays pure and knows nothing about
 * zones or trip bounds.
 */
export function legsForMember<
  T extends { memberId: string; travelType: TravelDirection },
>(
  records: readonly T[],
  seed: LegSeed | undefined,
  memberId: string,
  read: (record: T, direction: TravelDirection) => TravelLeg,
): Record<TravelDirection, TravelLeg> {
  const legs: Record<TravelDirection, TravelLeg> = {
    arrival: emptyLeg(),
    departure: emptyLeg(),
  };
  for (const direction of DIRECTIONS) {
    const record = travelForMemberDirection(records, memberId, direction);
    legs[direction] = record
      ? read(record, direction)
      : (seed?.[direction] ?? emptyLeg());
  }
  return legs;
}

export function validateLeg(
  leg: TravelLeg,
  direction: TravelDirection,
): LegErrors {
  const errors: LegErrors = {};
  // An untouched direction is not an error — it is simply unshared.
  if (!legIsFiled(leg, direction)) return errors;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(leg.day)) errors.day = "Pick the day.";

  const pertinent = pertinentClock(leg, direction);
  if (!isClockTime(pertinent.trim())) {
    errors[direction === "arrival" ? "arrivalTime" : "departureTime"] =
      "What time?";
  }
  // The other end is optional, but it has to be a time if it is there.
  const other = direction === "arrival" ? leg.departureTime : leg.arrivalTime;
  if (other.trim() && !isClockTime(other.trim())) {
    errors[direction === "arrival" ? "departureTime" : "arrivalTime"] =
      "Times are HH:MM.";
  }
  if (!leg.location.trim()) errors.location = "Where?";

  return errors;
}

/**
 * Field-level errors for the travel form. Pure, so the dialog stays a
 * thin shell over it. Who is required; each direction that has been
 * filled in needs its day, its own time, and where. The flight number
 * and the other end only ever fill things in.
 */
export function validateNewTravel(input: NewTravelInput): NewTravelErrors {
  const errors: NewTravelErrors = {};
  if (!input.memberId) errors.memberId = "Whose travel is this?";

  const arrival = validateLeg(input.arrival, "arrival");
  if (Object.keys(arrival).length > 0) errors.arrival = arrival;
  const departure = validateLeg(input.departure, "departure");
  if (Object.keys(departure).length > 0) errors.departure = departure;

  return errors;
}

/**
 * A flight-lookup result lands in a leg: both ends come back as
 * wall-clock times for the fields, the far-side location is carried
 * silently, and the two ends landing on different days raises the flag
 * the bounded calendar cannot express.
 */
export function legFromLookup(
  leg: TravelLeg,
  direction: TravelDirection,
  result: FlightLookupResult,
  flightNumber: string,
  timeZone: string | null,
): TravelLeg {
  const filled = applyFlightLookup(direction, result, flightNumber);
  const pertinentIso =
    direction === "arrival" ? filled.arrivalTime : filled.departureTime;
  const pertinentLocation =
    direction === "arrival" ? filled.arrivalLocation : filled.departureLocation;
  const farIso = direction === "arrival" ? filled.departureTime : filled.arrivalTime;
  const farLocation =
    direction === "arrival"
      ? filled.departureLocation
      : filled.arrivalLocation;

  const pertinent = pertinentIso ? wallClock(pertinentIso, timeZone) : null;
  const far = farIso ? wallClock(farIso, timeZone) : null;
  // The lookup carries real instants, so it can state what the two
  // clocks would otherwise have to be read for.
  const crossesMidnight =
    pertinent && far ? pertinent.date !== far.date : null;

  return {
    ...leg,
    flightNumber,
    day: pertinent?.date ?? leg.day,
    departureTime: far?.clock ?? leg.departureTime,
    arrivalTime: pertinent?.clock ?? leg.arrivalTime,
    location: pertinentLocation ?? leg.location,
    otherLocation: farLocation ?? leg.otherLocation,
    crossesMidnight,
  };
}

/**
 * A leg back into a record: wall-clock values stamped onto the trip's
 * own clock, the same trick the mocks use, with the far end one day
 * either side of the day the board files. Null when the direction was
 * left untouched or fails validation — the caller saves what is
 * returned and skips what is not.
 */
export function buildLegRecord(
  leg: TravelLeg,
  direction: TravelDirection,
  id: string,
  memberId: string,
  memberName: string,
  timeZone: string | null,
): MockTravel | null {
  if (!legIsFiled(leg, direction)) return null;
  if (Object.keys(validateLeg(leg, direction)).length > 0) return null;

  const arrival = direction === "arrival";
  // Which way the far end sits: back for an arrival that left the
  // evening before, forward for a departure that lands in the morning —
  // and the other way round for a hire, whose own end is the pickup. Only
  // the far end moves: the leg's own day is the day the strip picked and
  // the day the board files.
  const farShift = legCrossesMidnight(leg) ? farEndShift(leg, direction) : 0;
  const departureDay = arrival ? shift(leg.day, farShift) : leg.day;
  const arrivalDay = arrival ? leg.day : shift(leg.day, farShift);

  return {
    id,
    memberId,
    memberName,
    travelType: direction,
    // The leg's own mode, not a default: the row the form builds states
    // how the member is travelling, and the column is NOT NULL.
    transportMode: leg.transportMode,
    departureTime: leg.departureTime.trim()
      ? stamp(departureDay, leg.departureTime, timeZone)
      : null,
    departureLocation: arrival
      ? leg.otherLocation.trim() || null
      : leg.location.trim() || null,
    arrivalTime: leg.arrivalTime.trim()
      ? stamp(arrivalDay, leg.arrivalTime, timeZone)
      : null,
    arrivalLocation: arrival
      ? leg.location.trim() || null
      : leg.otherLocation.trim() || null,
    // Stored the way the lookup asks for it — compact, no space. The
    // field and the board write the space back in (`formatFlightNumber`),
    // the same split the phone numbers use: E.164 in the row, the way a
    // person writes it on screen.
    flightNumber: leg.flightNumber.trim()
      ? normalizeFlightNumber(leg.flightNumber)
      : null,
    details: leg.details.trim() ? leg.details.trim() : null,
    deletedAt: null,
  } satisfies MockTravel;
}

/**
 * A wall-clock time on a local day, as an instant.
 */
function stamp(day: string, clock: string, timeZone: string | null): string {
  const [year, month, date] = day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [hour, minute] = clock.trim().split(":").map(Number) as [
    number,
    number,
  ];
  // The offset where the leg happens, on the day it happens: a red-eye
  // that straddles a daylight boundary stamps each end in its own offset
  // rather than borrowing its sibling's.
  const offsetMinutes = zoneOffsetMinutes(
    timeZone,
    `${day}T12:00:00.000Z`,
  );
  return new Date(
    Date.UTC(year, month - 1, date, hour, minute) - offsetMinutes * 60_000,
  ).toISOString();
}

/**
 * Whether the leg's two ends fall on different days.
 *
 * An arrival earlier than its departure can only be the morning after:
 * a same-day leg with that shape would have a negative duration. So the
 * two clocks are enough to say it, and a source that carries real dates
 * can say it outright instead.
 *
 * A hire is read the other way round, and the leg's own mode is what
 * says so: its own end is the pickup on an arrival row and the dropoff
 * on a departure row (D4), so the pair runs *forwards* from the own end
 * and 10:00 picked up with a 17:00 dropoff is one day — where a flight
 * with those two clocks left the evening before. Inverting the
 * predicate is half of the hire; `farEndShift` is the other half, and
 * either one without the other stamps the same hire the same wrong day.
 */
export function legCrossesMidnight(leg: TravelLeg): boolean {
  if (leg.crossesMidnight !== null) return leg.crossesMidnight;
  if (!isClockTime(leg.departureTime.trim())) return false;
  if (!isClockTime(leg.arrivalTime.trim())) return false;
  const departure = minutesOf(leg.departureTime);
  const arrival = minutesOf(leg.arrivalTime);
  return leg.transportMode === "rental"
    ? arrival > departure
    : arrival < departure;
}

/**
 * Which way the far end sits from the leg's own day, once the leg
 * crossed midnight: `-1` for the day before, `1` for the day after.
 *
 * A journey's far end lies back from the day the board files when the
 * row is an arrival — you left the evening before — and forward when it
 * is a departure, where the red-eye home lands in the morning. A hire's
 * is the other way round, because its own end is the pickup on an
 * arrival row and the dropoff on a departure one: the far end runs
 * forward from an arrival and back from a departure.
 *
 * The second half of the hire's inversion — `legCrossesMidnight` is the
 * first — and the two are only correct together: with the predicate
 * inverted and this not, a 20:00 pickup and a 01:30 dropoff stamps the
 * dropoff the day *before* instead of the day after.
 */
function farEndShift(leg: TravelLeg, direction: TravelDirection): number {
  const rental = leg.transportMode === "rental";
  const forward = direction === "arrival" ? rental : !rental;
  return forward ? 1 : -1;
}

/**
 * The day the leg's other end falls on: back a day for an arrival that
 * left the evening before, on a day for a departure that lands in the
 * morning, and the leg's own day when it does not cross at all. A hire
 * is the other way round, the way its predicate is. Null when there is
 * no day picked yet.
 */
export function farEndDay(
  leg: TravelLeg,
  direction: TravelDirection,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(leg.day)) return null;
  if (!legCrossesMidnight(leg)) return leg.day;
  return shift(leg.day, farEndShift(leg, direction));
}

/**
 * What the other end's day is, in words, for the line under the field
 * that owns it. Null when the leg does not cross midnight: saying "the
 * same day" under a field is noise, and the day line above already says
 * which day that is.
 */
export function farEndNote(
  leg: TravelLeg,
  direction: TravelDirection,
): string | null {
  if (!legCrossesMidnight(leg)) return null;
  const day = farEndDay(leg, direction);
  if (!day) return null;
  return direction === "arrival"
    ? `Left ${formatDay(day)}`
    : `Lands ${formatDay(day)}`;
}

/** A record as the form wants it back, in the trip's own zone. */
export function legFromRecord(
  record: {
    /**
     * How the record is filed. Required, like `MockTravel`'s: the column
     * is `NOT NULL`, so a record that reached the app carries one, and a
     * reader that defaulted it would show a filed hire as a flight — and
     * write that back on save.
     */
    transportMode: TransportMode;
    departureTime: string | null;
    departureLocation: string | null;
    arrivalTime: string | null;
    arrivalLocation: string | null;
    flightNumber: string | null;
    details: string | null;
  },
  direction: TravelDirection,
  timeZone: string | null,
  tripStartDate: string,
  tripEndDate: string,
): TravelLeg {
  const arrival = direction === "arrival";
  const pertinentIso = arrival ? record.arrivalTime : record.departureTime;
  const farIso = arrival ? record.departureTime : record.arrivalTime;
  const pertinent = pertinentIso ? wallClock(pertinentIso, timeZone) : null;
  const far = farIso ? wallClock(farIso, timeZone) : null;

  // The record carries real instants, so the two ends' dates are known
  // rather than inferred — and reading them back is what lets the day
  // stay on a day the strip can show while the far end stays where it
  // belongs.
  //
  // "A day the strip can show" is the trip's own days *and the margin
  // either side* of it (`travelDays`). This used to be clamped to the
  // trip's own bounds, which was right only while the picker was a month
  // grid bounded by the trip: an arrival filed the evening before — the
  // case the margin was widened for — came back selected on the *last*
  // day of the trip, and saving it moved the arrival a week. Off the strip
  // entirely, the day is still pulled to the nearest cell there is,
  // because no cell can show it.
  const day = pertinent?.date ?? "";
  const firstCell = shift(tripStartDate, -TRIP_MARGIN_DAYS);
  const lastCell = shift(tripEndDate, TRIP_MARGIN_DAYS);
  const offStrip = Boolean(day && (day < firstCell || day > lastCell));

  return {
    transportMode: record.transportMode,
    day: offStrip ? (day < firstCell ? firstCell : lastCell) : day,
    // Both ends read from the side each belongs to, not by position:
    // the departure is this direction's own end when the direction is a
    // departure, and the far end only when it is an arrival.
    departureTime: (arrival ? far?.clock : pertinent?.clock) ?? "",
    arrivalTime: (arrival ? pertinent?.clock : far?.clock) ?? "",
    crossesMidnight: pertinent && far ? pertinent.date !== far.date : null,
    location: arrival
      ? (record.arrivalLocation ?? "")
      : (record.departureLocation ?? ""),
    otherLocation: arrival
      ? (record.departureLocation ?? "")
      : (record.arrivalLocation ?? ""),
    flightNumber: formatFlightNumber(record.flightNumber ?? ""),
    details: record.details ?? "",
  };
}

/**
 * A direction in one line, for the line under the toggle: the day it
 * really lands or leaves, the clock, and where. Empty when nothing has
 * been filled in — that state is the caller's to word, because "Not
 * shared yet" is about the trip, not about the string.
 *
 * The day is always this direction's own end, which is the day the
 * board files and the day the calendar picked. No zone on the clock:
 * the screen states it once, above everything it governs.
 */
export function legSummary(
  leg: TravelLeg,
  direction: TravelDirection,
): string {
  if (!legIsFiled(leg, direction)) return "";
  const parts: string[] = [];

  if (/^\d{4}-\d{2}-\d{2}$/.test(leg.day)) parts.push(formatDay(leg.day));
  const clock = pertinentClock(leg, direction);
  if (isClockTime(clock.trim())) parts.push(formatClock(clock.trim()));
  if (leg.location.trim()) parts.push(leg.location.trim());

  return joinFacts(...parts);
}
