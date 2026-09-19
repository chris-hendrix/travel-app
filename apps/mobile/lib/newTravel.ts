import { applyFlightLookup } from "@journiful/shared/utils";
import type { FlightLookupResult } from "@journiful/shared/types";
import { isClockTime } from "@/lib/time";
import { wallClock } from "@/lib/timezone";
import type { MockTravel } from "@/mocks/travel";

export type TravelSectionInput = {
  /** The section saves only when this is set — unticked, unshared. */
  enabled: boolean;
  day: string;
  /** 24-hour "20:30". */
  time: string;
  /** Where, as the member would say it. */
  location: string;
  flightNumber: string;
  details: string;
  /** Lookup-filled, carried silently like the web does. */
  hiddenTime?: string | undefined;
  hiddenLocation?: string | undefined;
};

export type NewTravelInput = {
  memberId: string;
  arrival: TravelSectionInput;
  departure: TravelSectionInput;
};

export type NewTravelErrors = {
  memberId?: string | undefined;
  arrival?: Partial<Record<"day" | "time" | "location", string>> | undefined;
  departure?: Partial<Record<"day" | "time" | "location", string>> | undefined;
};

export function emptySection(): TravelSectionInput {
  return {
    enabled: false,
    day: "",
    time: "",
    location: "",
    flightNumber: "",
    details: "",
  };
}

function validateSection(
  section: TravelSectionInput,
): Partial<Record<"day" | "time" | "location", string>> {
  const errors: Partial<Record<"day" | "time" | "location", string>> = {};
  // Unticked means unshared: nothing to check.
  if (!section.enabled) return errors;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(section.day)) errors.day = "Pick the day.";
  if (!isClockTime(section.time.trim())) errors.time = "What time?";
  if (!section.location.trim()) errors.location = "Where?";
  return errors;
}

/**
 * Field-level errors for the travel form. Pure, so the dialog stays a
 * thin shell over it. Who is required; each ticked direction needs its
 * day, time, and where. The flight number only ever fills things in.
 */
export function validateNewTravel(input: NewTravelInput): NewTravelErrors {
  const errors: NewTravelErrors = {};
  if (!input.memberId) errors.memberId = "Whose travel is this?";

  const arrival = validateSection(input.arrival);
  if (Object.keys(arrival).length > 0) errors.arrival = arrival;
  const departure = validateSection(input.departure);
  if (Object.keys(departure).length > 0) errors.departure = departure;

  return errors;
}

/**
 * A flight-lookup result lands in a section: the pertinent pair shows,
 * the counterpart rides along silently for the API, the web's own
 * trick. Day and clock come back in wall-clock terms for the fields.
 */
export function sectionFromLookup(
  section: TravelSectionInput,
  direction: "arrival" | "departure",
  result: FlightLookupResult,
  flightNumber: string,
  timeZone: string | null,
): TravelSectionInput {
  const filled = applyFlightLookup(direction, result, flightNumber);
  const pertinentTime =
    direction === "arrival" ? filled.arrivalTime : filled.departureTime;
  const pertinentLocation =
    direction === "arrival" ? filled.arrivalLocation : filled.departureLocation;
  const counterpartTime =
    direction === "arrival" ? filled.departureTime : filled.arrivalTime;
  const counterpartLocation =
    direction === "arrival"
      ? filled.departureLocation
      : filled.arrivalLocation;

  const clock = pertinentTime ? wallClock(pertinentTime, timeZone) : null;
  return {
    ...section,
    enabled: true,
    flightNumber,
    day: clock?.date ?? section.day,
    time: clock?.clock ?? section.time,
    location: pertinentLocation ?? section.location,
    hiddenTime: counterpartTime,
    hiddenLocation: counterpartLocation,
  };
}

/**
 * A section back into a record: wall-clock values stamped onto the
 * trip's own clock, the same trick the mocks use. Null when the
 * section is unticked or fails validation — the caller saves what is
 * returned and skips what is not.
 */
export function buildSectionRecord(
  section: TravelSectionInput,
  direction: "arrival" | "departure",
  id: string,
  memberId: string,
  memberName: string,
  zoneOffsetMinutes: number,
): MockTravel | null {
  if (!section.enabled) return null;
  if (Object.keys(validateSection(section)).length > 0) return null;

  const [year, month, day] = section.day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [hour, minute] = section.time.trim().split(":").map(Number) as [
    number,
    number,
  ];
  const stamp = new Date(
    Date.UTC(year, month - 1, day, hour, minute) -
      zoneOffsetMinutes * 60_000,
  ).toISOString();

  return {
    id,
    memberId,
    memberName,
    travelType: direction,
    time: stamp,
    location: section.location.trim(),
    flightNumber: section.flightNumber.trim()
      ? section.flightNumber.trim()
      : null,
    details: section.details.trim() ? section.details.trim() : null,
    deletedAt: null,
  };
}
