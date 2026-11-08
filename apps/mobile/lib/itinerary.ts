import { daysBetween } from "@/lib/countdown";
import { formatDay, formatTimeRange, weekdayAbbrev } from "@/lib/dateRange";
import { todayIn, wallClock } from "@/lib/timezone";
import { joinFacts } from "@/lib/wording";
import type { PlacePhotoCredit } from "@/lib/place-images";

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
  /**
   * The linked Google place id (`place.placeId`), null when the place
   * was typed or the row predates linking. Drives the pinned Maps link.
   */
  placeId?: string | null;
  /**
   * The picked place's snapshot strings (the tapped row's name and the
   * details response's formatted address). Null when the place was
   * typed or the row predates snapshots; absent when the caller never
   * said, which leaves the columns untouched. Read by the detail
   * block (`lib/place-rows.ts`); written by the picker write path.
   */
  placeName?: string | null;
  placeAddress?: string | null;
  /**
   * Where it is, as Maps would take it: the live Places details lookup
   * resolves these when the place was picked from a suggestion, and
   * they ride to the API on create/update. Null when the place was
   * typed or came from the static list, which carry no coordinates —
   * never defaulted, never 0. Optional so rows built before the
   * lookup existed keep compiling; absent reads as no coordinates.
   */
  locationLat?: number | null;
  locationLon?: number | null;
  /** The place's photo, which the API proxies from Places; null when there is none. */
  image: string | null;
  /**
   * The photo's required Google Maps source link, null for placeholders.
   * Every rendered photo reaches it: the tile through `PhotoCard`, the
   * detail through its own tap.
   */
  photoSourceUri?: string | null;
  /** The photo's author credit for the detail surface; tiles render nothing. */
  photoCredit?: PlacePhotoCredit | null;
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
  // All day has no clock, so there is no clock to read. Everything else
  // is a time and nothing more: the zone the times are in is stated once,
  // by the chrome above them, rather than repeated on every row.
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

/**
 * The days an event falls on, in order from the first day of the trip to
 * the last, with each day's events running from morning to night.
 *
 * Chronological, which end of a trip you read from is the caller's
 * question. The zone comes from the caller because a day is a question
 * about a place — an evening in Mallorca is tomorrow in Auckland.
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
      // All-day first, then by the clock. An all-day event happens all
      // day, so it leads the day it belongs to rather than sorting by
      // the midnight it is stamped with — the flag says that, and the
      // order follows from it.
      events: dayEvents.sort(
        (a, b) =>
          Number(b.allDay) - Number(a.allDay) ||
          a.startTime.localeCompare(b.startTime),
      ),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** What the trip's now has scheduled, as the page's one live-line item. */
export type NextEvent = {
  /** The row itself, for its id (the detail door) and its name (the label). */
  event: ItineraryEvent;
  /** The event's own day, named: "Sat". In the trip's zone — an evening
   *  in Mallorca can belong to a different weekday than the device reads. */
  dayLabel: string;
  /** The start, twenty-four hour, in the trip's zone: "18:00". Null when
   *  the day is the whole answer — an all-day card reads its range elsewhere. */
  clock: string | null;
};

/**
 * The event the trip's now belongs to: the one still running, else the
 * soonest one ahead — and when nothing is running or coming, nothing.
 *
 * This is the read behind the trip page's live line, so its rule is the
 * reader's, not the schedule's: an event is over when it *ends*, not when
 * it starts, and an all-day event owes its reach to its own date, never
 * to the midnight it is stamped with — the flag says that, and the look
 * ahead follows from it. Deleted rows stay out (`liveEvents`), and the
 * zone is the caller's, for the same reason the day grouping takes one.
 */
export function nextEvent(
  events: ItineraryEvent[],
  timeZone: string | null,
  now: Date,
): NextEvent | null {
  const today = todayIn(timeZone, now);
  const nowMs = now.getTime();

  const live = liveEvents(events).sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  const upcoming = live.find((event) => {
    const endMs = event.endTime ? new Date(event.endTime).getTime() : null;
    // An end says when it stops. A start's day says the most an
    // all-day event promises: it is live on its day, past after it.
    if (endMs !== null) return endMs >= nowMs;
    return wallClock(event.startTime, timeZone).date >= today;
  });
  if (!upcoming) return null;

  return {
    event: upcoming,
    dayLabel: weekdayAbbrev(wallClock(upcoming.startTime, timeZone).date),
    clock: upcoming.allDay
      ? null
      : wallClock(upcoming.startTime, timeZone).clock,
  };
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
      return joinFacts("Today", day);
    case 1:
      return joinFacts("Tomorrow", day);
    case -1:
      return joinFacts("Yesterday", day);
    default:
      return day;
  }
}
