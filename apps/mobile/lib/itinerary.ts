import { daysBetween } from "@/lib/countdown";
import { formatDay, formatTimeRange } from "@/lib/dateRange";
import { wallClock } from "@/lib/timezone";

/**
 * The API's `event_type`, in full. An event's type is what decides
 * whether it is a card with a photo at all — a flight has no place
 * behind it — but only the events with photos are built so far.
 */
export type EventType =
  | "travel"
  | "food_and_drink"
  | "arts_and_entertainment"
  | "outdoors"
  | "nightlife"
  | "wellness"
  | "shopping"
  | "lodging"
  | "misc";

/**
 * A type, in the fewest words that fit on a chip. The API sends the
 * enum and no label of its own, so this is copy rather than data — and
 * "arts_and_entertainment" is far too long to set on a photo.
 */
export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  travel: "Travel",
  food_and_drink: "Food",
  arts_and_entertainment: "Arts",
  outdoors: "Outdoors",
  nightlife: "Nightlife",
  wellness: "Wellness",
  shopping: "Shopping",
  lodging: "Lodging",
  misc: "Other",
};

/**
 * An event as the itinerary needs it, shaped after the API's row. Times
 * are ISO datetimes and render in the device's zone for now — the trip's
 * own `preferredTimezone` is not modelled here yet.
 */
export type ItineraryEvent = {
  id: string;
  name: string;
  type: EventType;
  /** The organizer's prose, null until someone writes one. */
  description: string | null;
  startTime: string;
  /** Null when nothing said when it ends. */
  endTime: string | null;
  /**
   * The API's word for an event with no time of day: it still carries a
   * start — the schema requires one — and says so here instead. The
   * itinerary prints the day, never "12:00 AM".
   */
  allDay: boolean;
  /** Where it is, as a person would say it. */
  place: string;
  /** The place's photo, which the API proxies from Places. */
  image: string;
  /**
   * The API's soft delete, and why deleting needs no confirmation step:
   * a deleted event is still there, waiting for the Deleted items screen
   * the PRD asks for. Null while it is live.
   */
  deletedAt: string | null;
};

/**
 * When an event is, in the one place both the card and the row ask: the
 * day heading already says which day, so this is only ever the clock —
 * or the absence of one.
 */
export function eventTimeLabel(
  event: ItineraryEvent,
  timeZone: string | null,
): string {
  if (event.allDay) return "All day";
  return formatTimeRange(event.startTime, event.endTime, timeZone);
}

/**
 * Edits applied over the events they belong to, earliest first.
 *
 * An edit is remembered against an id rather than written into the list,
 * so a row that came from a mock pool can be edited without the pool
 * being rebuilt — and an edit always wins over whatever is underneath
 * it, mock or authored.
 */
export function withEdits(
  events: ItineraryEvent[],
  edits: Record<string, Partial<ItineraryEvent>>,
): ItineraryEvent[] {
  return events
    .map((event) =>
      edits[event.id] ? { ...event, ...edits[event.id] } : event,
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/**
 * What the itinerary shows: everything that has not been deleted. The
 * deleted ones are not dropped, they are held back — the PRD's Deleted
 * items screen is where they come back from.
 */
export function liveEvents(events: ItineraryEvent[]): ItineraryEvent[] {
  return events.filter((event) => !event.deletedAt);
}

export type EventDay = {
  /** Local date, yyyy-mm-dd. */
  date: string;
  events: ItineraryEvent[];
};

/** Days that are today or still to come, soonest first. */
export function daysFrom(days: EventDay[], today: string): EventDay[] {
  return days.filter((day) => day.date >= today);
}

/**
 * The days an event falls on, in order from the first day of the trip to
 * the last, with each day's events running from morning to night.
 *
 * Chronological, not "today first": which end of a trip you want to read
 * from is the caller's question, and `daysFrom` answers the other half of
 * it. The zone comes from the caller because a day is a question about a
 * place — an evening in Mallorca is tomorrow in Auckland.
 */
export function groupEventsByDay(
  events: ItineraryEvent[],
  timeZone: string | null = null,
): EventDay[] {
  const byDay = new Map<string, ItineraryEvent[]>();

  for (const event of events) {
    // Bucketed in the same zone the times are read in, or a late event
    // would be filed under a day its card does not say.
    const date = wallClock(event.startTime, timeZone).date;
    const day = byDay.get(date);
    if (day) day.push(event);
    else byDay.set(date, [event]);
  }

  return [...byDay]
    .map(([date, dayEvents]) => ({
      date,
      events: dayEvents.sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** A trip is over once its last day has been and gone. */
export function tripIsOver(endDate: string, today: string): boolean {
  return endDate < today;
}

/**
 * The day, named if it is one we have a word for. The date comes along
 * either way: the cards carry times, so the heading is the only place an
 * itinerary ever says which calendar day you are looking at.
 *
 *   "Today · Fri Sep 19"   "Tomorrow · Sat Sep 20"   "Mon Sep 21"
 */
export function dayLabel(date: string, today: string): string {
  const day = formatDay(date);

  switch (daysBetween(today, date)) {
    case 0:
      return `Today · ${day}`;
    case 1:
      return `Tomorrow · ${day}`;
    case -1:
      return `Yesterday · ${day}`;
    default:
      return day;
  }
}
