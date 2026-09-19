import { isClockTime } from "@/lib/time";
import { wallClock } from "@/lib/timezone";
import type { MockTravel } from "@/mocks/travel";

export type NewTravelInput = {
  direction: "arrival" | "departure";
  memberId: string;
  day: string;
  /** 24-hour "20:30". Required: the API's invariant is a pertinent time. */
  time: string;
  /** Where, as the member would say it. */
  location: string;
  flightNumber: string;
  details: string;
};

export type NewTravelErrors = Partial<
  Record<"memberId" | "day" | "time" | "location", string>
>;

/**
 * Field-level errors for the travel form. Pure, so the dialog stays a
 * thin shell over it. Who, which day, what time, and where are the
 * travel; the flight number and the details only fill it in.
 */
export function validateNewTravel(input: NewTravelInput): NewTravelErrors {
  const errors: NewTravelErrors = {};

  if (!input.memberId) errors.memberId = "Whose travel is this?";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) errors.day = "Pick the day.";
  if (!isClockTime(input.time.trim())) errors.time = "What time?";
  if (!input.location.trim()) errors.location = "Where?";

  return errors;
}

/**
 * A record as the form wants it back: wall-clock values in the trip's
 * own zone, because that is what the fields ask for and what was typed
 * the first time round.
 */
export function draftFromTravel(
  record: MockTravel,
  memberName: string,
  timeZone: string | null,
): NewTravelInput & { memberName: string } {
  const clock = record.time
    ? wallClock(record.time, timeZone)
    : { date: "", clock: "" };
  return {
    direction: record.travelType,
    memberId: record.memberId,
    memberName,
    day: clock.date,
    time: clock.clock,
    location: record.location ?? "",
    flightNumber: record.flightNumber ?? "",
    details: record.details ?? "",
  };
}

/**
 * Stamp a wall-clock time onto the trip's clock, the same trick the
 * mocks use: a 15:40 entered for Mallorca is 15:40 in Mallorca.
 */
export function buildTravel(
  input: NewTravelInput,
  id: string,
  memberName: string,
  zoneOffsetMinutes: number,
): MockTravel {
  const [year, month, day] = input.day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [hour, minute] = input.time.trim().split(":").map(Number) as [
    number,
    number,
  ];
  const stamp = new Date(
    Date.UTC(year, month - 1, day, hour, minute) -
      zoneOffsetMinutes * 60_000,
  ).toISOString();

  return {
    id,
    memberId: input.memberId,
    memberName,
    travelType: input.direction,
    time: stamp,
    location: input.location.trim(),
    flightNumber: input.flightNumber.trim()
      ? input.flightNumber.trim()
      : null,
    details: input.details.trim() ? input.details.trim() : null,
    deletedAt: null,
  };
}
