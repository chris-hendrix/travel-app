import type { ItineraryEvent } from "@/lib/itinerary";
import { isClockTime, minutesOf } from "@/lib/time";

export type NewEventInput = {
  name: string;
  day: string;
  start: string;
  end: string;
  place: string;
};

export type NewEventErrors = Partial<
  Record<"name" | "day" | "end" | "place", string>
>;

/**
 * Field-level errors for the add-event form. Pure, so the dialog stays
 * a thin shell over it. The name, the day, and the place are the event;
 * the times only fill it in.
 */
export function validateNewEvent(input: NewEventInput): NewEventErrors {
  const errors: NewEventErrors = {};

  if (!input.name.trim()) errors.name = "Give the event a name.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) errors.day = "Pick the day.";
  // Required, but not required to match: a place listed by Google and a
  // place someone typed are the same answer to "where is it".
  if (!input.place.trim()) errors.place = "Where is it?";

  if (input.end.trim()) {
    if (!isClockTime(input.end)) {
      errors.end = "End time as HH:MM.";
    } else if (
      isClockTime(input.start) &&
      minutesOf(input.end) <= minutesOf(input.start)
    ) {
      errors.end = "It ends before it starts.";
    }
  }

  return errors;
}

/**
 * A start time the API will accept when the organizer did not pick one:
 * the schema requires `startTime`, so an event whose time nobody set is
 * sent at the start of its day rather than refused here. Midnight is the
 * one hour that reads as "no particular time" once the day heading has
 * already said which day it is.
 */
export const UNTIMED = "00:00";

/**
 * Stamp a wall-clock time onto the trip's clock, the same trick the
 * mocks use: an 8:30 entered for Mallorca is 8:30 in Mallorca. The
 * offset and the photo come from the mocks until the API owns them.
 *
 * The type is not asked for and not guessed: it is the place's Google
 * Places category, which is the API's to read. An event with no start
 * time is sent as all-day — the schema wants a `startTime` either way,
 * so an untimed event is stamped at its own midnight and says `allDay`,
 * which is the API's own word for "no particular time".
 */
export function buildEvent(
  input: NewEventInput,
  id: string,
  zoneOffsetMinutes: number,
  photo: string,
): ItineraryEvent {
  const [year, month, day] = input.day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const untimed = !input.start.trim();
  const [hour, minute] = (untimed ? UNTIMED : input.start.trim())
    .split(":")
    .map(Number) as [number, number];
  const startMs =
    Date.UTC(year, month - 1, day, hour, minute) -
    zoneOffsetMinutes * 60_000;

  let endTime: string | null = null;
  if (input.end.trim()) {
    const [endHour, endMinute] = input.end.trim().split(":").map(Number) as [
      number,
      number,
    ];
    endTime = new Date(
      Date.UTC(year, month - 1, day, endHour, endMinute) -
        zoneOffsetMinutes * 60_000,
    ).toISOString();
  }

  return {
    id,
    name: input.name.trim(),
    // Until Places answers: an unclassified event.
    type: "misc",
    startTime: new Date(startMs).toISOString(),
    endTime,
    allDay: untimed,
    place: input.place.trim(),
    image: photo,
  };
}

