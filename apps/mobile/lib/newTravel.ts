import { applyFlightLookup } from "@journiful/shared/utils";
import type { FlightLookupResult } from "@journiful/shared/types";
import { addDays as shift, formatDay } from "@/lib/dateRange";
import { formatClock, isClockTime, minutesOf } from "@/lib/time";
import { wallClock, zoneOffsetMinutes } from "@/lib/timezone";
import { joinFacts } from "@/lib/wording";
import type { MockTravel } from "@/mocks/travel";

export type TravelDirection = "arrival" | "departure";

/**
 * One direction's travel as the form asks for it — a leg, with a start
 * and an end, the way a flight has both.
 *
 * `day` is the day of this direction's own event, which is the day the
 * board files: the day you land for an arrival, the day you leave for a
 * departure. Both of those fall inside the trip, which is what lets the
 * calendar be bounded by the trip's own dates.
 *
 * The other end is not always the same day. That is not a preference to
 * ask for, it is arithmetic: an arrival earlier than its departure can
 * only mean the leg crossed midnight, because a same-day one would have
 * a negative duration. `crossesMidnight` is that sum — `null` to work it
 * out from the two times, or a fact when the source already knows it,
 * which a flight lookup does because it carries both timestamps.
 */
export type TravelLeg = {
  day: string;
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
  // evening before, forward for a departure that lands in the morning.
  const crossed = legCrossesMidnight(leg);
  const departureDay = crossed && arrival ? shift(leg.day, -1) : leg.day;
  const arrivalDay = crossed && !arrival ? shift(leg.day, 1) : leg.day;

  return {
    id,
    memberId,
    memberName,
    travelType: direction,
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
    flightNumber: leg.flightNumber.trim() ? leg.flightNumber.trim() : null,
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
 */
export function legCrossesMidnight(leg: TravelLeg): boolean {
  if (leg.crossesMidnight !== null) return leg.crossesMidnight;
  if (!isClockTime(leg.departureTime.trim())) return false;
  if (!isClockTime(leg.arrivalTime.trim())) return false;
  return minutesOf(leg.arrivalTime) < minutesOf(leg.departureTime);
}

/**
 * The day the leg's other end falls on: back a day for an arrival that
 * left the evening before, on a day for a departure that lands in the
 * morning, and the leg's own day when it does not cross at all. Null
 * when there is no day picked yet.
 */
export function farEndDay(
  leg: TravelLeg,
  direction: TravelDirection,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(leg.day)) return null;
  if (!legCrossesMidnight(leg)) return leg.day;
  return shift(leg.day, direction === "arrival" ? -1 : 1);
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
  // stay inside the trip while the far end stays where it belongs.
  const day = pertinent?.date ?? "";
  const outsideTrip = Boolean(day && (day < tripStartDate || day > tripEndDate));

  return {
    day: outsideTrip ? tripEndDate : day,
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
    flightNumber: record.flightNumber ?? "",
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
