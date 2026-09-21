import { isClockTime } from "@/lib/time";
import type { Stay, StayLink } from "@/lib/stays";
import { wallClock, zoneOffsetMinutes } from "@/lib/timezone";

export type NewStayInput = {
  name: string;
  /** The one fact everybody needs and the one Maps needs. */
  address: string;
  /** Local dates, yyyy-mm-dd. The days you arrive and leave. */
  checkInDay: string;
  checkOutDay: string;
  /**
   * Optional, and often unknown: "check in from 3" is a thing hosts say
   * and an app booking rarely does. An empty one is a real answer rather
   * than an unfinished field.
   */
  checkInTime: string;
  checkOutTime: string;
  /**
   * Where the way in goes, because the row has no field for it: the
   * door code, the lockbox, the wifi, the host's number. One paragraph,
   * written the way the host sent it.
   */
  description: string;
};

export type NewStayErrors = Partial<
  Record<
    | "name"
    | "address"
    | "checkInDay"
    | "checkOutDay"
    | "checkInTime"
    | "checkOutTime",
    string
  >
>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Field-level errors for the add-stay form. Pure, so the dialog stays a
 * thin shell over it.
 *
 * The name, the address and the two days are the stay. The times are
 * wanted only when they are offered, and the description is never
 * required — a hotel with nothing written down is a hotel, not an
 * incomplete form.
 */
export function validateNewStay(input: NewStayInput): NewStayErrors {
  const errors: NewStayErrors = {};

  if (!input.name.trim()) errors.name = "Give the place a name.";
  // Required, because a stay with an address is one a driver can be told
  // about, and that is half of what this screen is for.
  if (!input.address.trim()) errors.address = "Where is it?";

  if (!DATE.test(input.checkInDay)) {
    errors.checkInDay = "Pick the day you arrive.";
  }
  if (!DATE.test(input.checkOutDay)) {
    errors.checkOutDay = "Pick the day you leave.";
  } else if (DATE.test(input.checkInDay) && input.checkOutDay < input.checkInDay) {
    errors.checkOutDay = "It ends before it starts.";
  }

  if (input.checkInTime.trim() && !isClockTime(input.checkInTime.trim())) {
    errors.checkInTime = "Check-in as HH:MM.";
  }
  if (input.checkOutTime.trim() && !isClockTime(input.checkOutTime.trim())) {
    errors.checkOutTime = "Check-out as HH:MM.";
  }

  return errors;
}

/**
 * A stay as the form wants it back: wall-clock values on the trip's own
 * clock, because that is what the fields ask for and what the organizer
 * read off the booking.
 */
export function draftFromStay(
  stay: Stay,
  timeZone: string | null,
): NewStayInput {
  const from = stay.checkIn ? wallClock(stay.checkIn, timeZone) : null;
  const to = stay.checkOut ? wallClock(stay.checkOut, timeZone) : null;

  return {
    name: stay.name,
    address: stay.address ?? "",
    checkInDay: from?.date ?? "",
    checkOutDay: to?.date ?? "",
    // A midnight is a day nobody gave a time for, so it comes back as an
    // empty field rather than as 12:00 AM — otherwise every edit would
    // silently invent the time the stay never had.
    checkInTime: from && from.clock !== "00:00" ? from.clock : "",
    checkOutTime: to && to.clock !== "00:00" ? to.clock : "",
    description: stay.description ?? "",
  };
}

/** A date and a clock on the trip's zone, or null when the day is blank. */
function stamp(
  day: string,
  clock: string,
  timeZone: string | null,
): string | null {
  if (!DATE.test(day)) return null;

  const [year, month, date] = day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [hour, minute] = (
    clock.trim() && isClockTime(clock.trim()) ? clock.trim() : "00:00"
  )
    .split(":")
    .map(Number) as [number, number];

  // The offset of the zone the fields were read in, on the day itself:
  // what was typed means the wall clock there, not in UTC.
  const offsetMinutes = zoneOffsetMinutes(timeZone, `${day}T12:00:00.000Z`);

  return new Date(
    Date.UTC(year, month - 1, date, hour, minute) - offsetMinutes * 60_000,
  ).toISOString();
}

/**
 * The form's answers as an API row. An empty string becomes null: a stay
 * with no description has none, which is a different thing from a
 * description of "".
 *
 * The links come along from whatever was there, because this form does
 * not ask for them: they are a listing and a set of house rules, pasted
 * once when the stay is made rather than retyped on every edit. The
 * coordinates stay null until the API's geocoding answers.
 */
export function buildStay(
  input: NewStayInput,
  id: string,
  timeZone: string | null,
  photo: string,
  links: StayLink[] = [],
): Stay {
  const text = (value: string) => (value.trim() ? value.trim() : null);

  return {
    id,
    name: input.name.trim(),
    address: text(input.address),
    addressLat: null,
    addressLon: null,
    description: text(input.description),
    checkIn: stamp(input.checkInDay, input.checkInTime, timeZone),
    checkOut: stamp(input.checkOutDay, input.checkOutTime, timeZone),
    image: photo,
    links,
    deletedAt: null,
  };
}
