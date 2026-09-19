import { applyFlightLookup } from "@journiful/shared/utils";
import type { FlightLookupResult } from "@journiful/shared/types";
import { isClockTime } from "@/lib/time";
import { wallClock } from "@/lib/timezone";
import type { MockTravel } from "@/mocks/travel";

export type TravelDirection = "arrival" | "departure";

/**
 * One direction's travel as the form asks for it: the day, the time,
 * where, the flight number if it was a flight, and the details the
 * board keeps behind the accordion.
 *
 * `nextDay` exists because the day picker is bounded by the trip: a
 * red-eye home lands after the last day, and the one thing the calendar
 * cannot offer is the morning after it. The flag is that morning.
 */
export type TravelLeg = {
  day: string;
  time: string;
  location: string;
  flightNumber: string;
  details: string;
  nextDay: boolean;
};

export type NewTravelInput = {
  memberId: string;
  arrival: TravelLeg;
  departure: TravelLeg;
};

export type LegErrors = Partial<Record<"day" | "time" | "location", string>>;

export type NewTravelErrors = {
  memberId?: string | undefined;
  arrival?: LegErrors | undefined;
  departure?: LegErrors | undefined;
};

export function emptyLeg(): TravelLeg {
  return {
    day: "",
    time: "",
    location: "",
    flightNumber: "",
    details: "",
    nextDay: false,
  };
}

/** A leg is filed once it has a day and a time: who and when, the row. */
export function legIsFiled(leg: TravelLeg): boolean {
  return Boolean(leg.day.trim()) || Boolean(leg.time.trim());
}

export function validateLeg(leg: TravelLeg): LegErrors {
  const errors: LegErrors = {};
  // An untouched direction is not an error — it is simply unshared.
  if (!legIsFiled(leg)) return errors;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(leg.day)) errors.day = "Pick the day.";
  if (!isClockTime(leg.time.trim())) errors.time = "What time?";
  if (!leg.location.trim()) errors.location = "Where?";
  return errors;
}

/**
 * Field-level errors for the travel form. Pure, so the dialog stays a
 * thin shell over it. Who is required; each direction that has been
 * filled in needs its day, time, and where. The flight number only ever
 * fills things in.
 */
export function validateNewTravel(input: NewTravelInput): NewTravelErrors {
  const errors: NewTravelErrors = {};
  if (!input.memberId) errors.memberId = "Whose travel is this?";

  const arrival = validateLeg(input.arrival);
  if (Object.keys(arrival).length > 0) errors.arrival = arrival;
  const departure = validateLeg(input.departure);
  if (Object.keys(departure).length > 0) errors.departure = departure;

  return errors;
}

/**
 * A flight-lookup result lands in a leg: the pertinent pair shows, the
 * day and clock come back in wall-clock terms for the fields, and an
 * arrival that lands on the next calendar day raises the flag the
 * bounded picker cannot express.
 */
export function legFromLookup(
  leg: TravelLeg,
  direction: TravelDirection,
  result: FlightLookupResult,
  flightNumber: string,
  timeZone: string | null,
): TravelLeg {
  const filled = applyFlightLookup(direction, result, flightNumber);
  const pertinentTime =
    direction === "arrival" ? filled.arrivalTime : filled.departureTime;
  const pertinentLocation =
    direction === "arrival" ? filled.arrivalLocation : filled.departureLocation;
  const counterpartTime =
    direction === "arrival" ? filled.departureTime : filled.arrivalTime;

  const clock = pertinentTime ? wallClock(pertinentTime, timeZone) : null;
  const counterpart = counterpartTime
    ? wallClock(counterpartTime, timeZone)
    : null;

  return {
    ...leg,
    flightNumber,
    day: clock?.date ?? leg.day,
    time: clock?.clock ?? leg.time,
    location: pertinentLocation ?? leg.location,
    // The flight crossed midnight when its two ends fall on different
    // days: whichever end belongs to this leg is the one on the far day.
    nextDay: Boolean(clock && counterpart && clock.date !== counterpart.date),
  };
}

/**
 * A leg back into a record: wall-clock values stamped onto the trip's
 * own clock, the same trick the mocks use. Null when the direction was
 * left untouched or fails validation — the caller saves what is
 * returned and skips what is not.
 */
export function buildLegRecord(
  leg: TravelLeg,
  direction: TravelDirection,
  id: string,
  memberId: string,
  memberName: string,
  zoneOffsetMinutes: number,
  tripEndDate: string,
): MockTravel | null {
  if (!legIsFiled(leg)) return null;
  if (Object.keys(validateLeg(leg)).length > 0) return null;

  // The morning after the trip's last day, for the flight that lands
  // when the calendar has run out.
  const day = leg.nextDay ? addDays(tripEndDate, 1) : leg.day;
  const [year, month, date] = day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [hour, minute] = leg.time.trim().split(":").map(Number) as [
    number,
    number,
  ];
  const stamp = new Date(
    Date.UTC(year, month - 1, date, hour, minute) -
      zoneOffsetMinutes * 60_000,
  ).toISOString();

  return {
    id,
    memberId,
    memberName,
    travelType: direction,
    time: stamp,
    location: leg.location.trim(),
    flightNumber: leg.flightNumber.trim() ? leg.flightNumber.trim() : null,
    details: leg.details.trim() ? leg.details.trim() : null,
    deletedAt: null,
  };
}

/** One year of days, ISO. Only ever used one day at a time. */
function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A record as the form wants it back, in the trip's own zone. */
export function legFromRecord(
  record: {
    time: string | null;
    location: string | null;
    flightNumber: string | null;
    details: string | null;
  },
  timeZone: string | null,
  tripEndDate: string,
): TravelLeg {
  const clock = record.time ? wallClock(record.time, timeZone) : null;
  // Reading the flag back off the date, so editing a red-eye and saving
  // it again does not quietly move it onto the trip's last day.
  const nextDay = Boolean(clock && clock.date > tripEndDate);
  return {
    day: nextDay ? tripEndDate : (clock?.date ?? ""),
    time: clock?.clock ?? "",
    location: record.location ?? "",
    flightNumber: record.flightNumber ?? "",
    details: record.details ?? "",
    nextDay,
  };
}
