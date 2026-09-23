import type { ItineraryEvent } from "@/lib/itinerary";
import { isClockTime, minutesOf } from "@/lib/time";
import { wallClock, zoneOffsetMinutes } from "@/lib/timezone";

export type NewEventInput = {
  name: string;
  /** The organizer's prose. Optional: most events need none. */
  description: string;
  day: string;
  /**
   * No time at all: the event is the day. A real answer rather than an
   * empty field, which is why the form asks it outright — a start time
   * left blank used to be the way in, and that made "not finished
   * filling this in" indistinguishable from "there is no time".
   */
  allDay: boolean;
  start: string;
  /** Optional even on a timed event: a thing can simply begin. */
  end: string;
  place: string;
  /**
   * The live Places details lookup's coordinates for the place, when
   * it was picked from a suggestion. Absent or null when the place was
   * typed or came from the static list, which carry no coordinates —
   * nothing invents a value, and no coordinate defaults to 0.
   */
  locationLat?: number | null;
  locationLon?: number | null;
};

export type NewEventErrors = Partial<
  Record<"name" | "day" | "start" | "end" | "place", string>
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

  // A timed event has a start; an all-day one has no clock to check.
  if (!input.allDay && !isClockTime(input.start.trim())) {
    errors.start = "What time?";
  }

  if (!input.allDay && input.end.trim()) {
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
 * A start time the API will accept when the event has no time of its
 * own: the schema requires `startTime`, so an all-day event is stamped
 * at the start of its day rather than refused here. Midnight is the one
 * hour that reads as "no particular time" once the day heading has
 * already said which day it is — and `allDay` is what says so, so no
 * reader has to infer it from the hour.
 */
export const UNTIMED = "00:00";

/**
 * An event as the form wants it back: wall-clock values in the trip's own
 * zone, because that is what the fields ask for and what the organizer
 * typed the first time round. An all-day event has no clock to fill in,
 * so its times come back empty rather than as midnight.
 */
export function draftFromEvent(
  event: ItineraryEvent,
  timeZone: string | null,
): NewEventInput {
  return {
    name: event.name,
    description: event.description ?? "",
    place: event.place,
    // The coordinates come along when the row has them, so an edit
    // that touches nothing else keeps them; a place with none reads
    // as absent, never as 0.
    locationLat: event.locationLat ?? null,
    locationLon: event.locationLon ?? null,
    day: wallClock(event.startTime, timeZone).date,
    allDay: event.allDay,
    start: event.allDay ? "" : wallClock(event.startTime, timeZone).clock,
    end:
      event.allDay || !event.endTime
        ? ""
        : wallClock(event.endTime, timeZone).clock,
  };
}

/**
 * Stamp a wall-clock time onto the trip's clock, the same trick the
 * mocks use: an 8:30 entered for Mallorca is 8:30 in Mallorca. The
 * offset and the photo come from the mocks until the API owns them.
 *
 * The type is not asked for and not guessed: it is the place's Google
 * Places category, which is the API's to read. An all-day event is sent
 * with `allDay`, the API's own word for "no particular time" — the
 * schema wants a `startTime` either way, so it is stamped at its own
 * midnight and the flag says that hour means nothing.
 */
export function buildEvent(
  input: NewEventInput,
  id: string,
  timeZone: string | null,
  photo: string,
): ItineraryEvent {
  const [year, month, day] = input.day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  // Validated input cannot get here timed and clockless. A caller that
  // skipped validation still must not be handed an Invalid Date, so an
  // unreadable start reads as the all-day it effectively is.
  const untimed = input.allDay || !isClockTime(input.start.trim());
  // The offset of the zone the fields were read in, on the day itself:
  // what was typed means the wall clock there, not in UTC.
  const offsetMinutes = zoneOffsetMinutes(
    timeZone,
    `${input.day}T12:00:00.000Z`,
  );
  const [hour, minute] = (untimed ? UNTIMED : input.start.trim())
    .split(":")
    .map(Number) as [number, number];
  const startMs =
    Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60_000;

  let endTime: string | null = null;
  if (input.end.trim()) {
    const [endHour, endMinute] = input.end.trim().split(":").map(Number) as [
      number,
      number,
    ];
    endTime = new Date(
      Date.UTC(year, month - 1, day, endHour, endMinute) -
        offsetMinutes * 60_000,
    ).toISOString();
  }

  return {
    id,
    name: input.name.trim(),
    // An empty description is no description, not an empty string.
    description: input.description.trim() ? input.description.trim() : null,
    // Until Places answers: an unclassified event.
    type: "misc",
    startTime: new Date(startMs).toISOString(),
    endTime,
    allDay: untimed,
    place: input.place.trim(),
    // The live lookup's coordinates when the place was picked from a
    // suggestion; null when it was typed or came from the static list.
    locationLat:
      typeof input.locationLat === "number" ? input.locationLat : null,
    locationLon:
      typeof input.locationLon === "number" ? input.locationLon : null,
    image: photo,
    // An edit arrives as a new event object, so the flag it carried has
    // to be brought along or editing a deleted event would undelete it.
    deletedAt: null,
  };
}

