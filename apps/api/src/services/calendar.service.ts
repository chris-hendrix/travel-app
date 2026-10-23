import { randomUUID } from "node:crypto";
import { eq, and, isNull, ne, inArray } from "drizzle-orm";
import ical, {
  ICalCalendarMethod,
  ICalEventTransparency,
  type ICalCalendar,
} from "ical-generator";
import {
  users,
  members,
  trips,
  events,
  accommodations,
  memberTravel,
  type User,
  type Trip,
  type Event,
  type Accommodation,
  type MemberTravel,
} from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";
import {
  formatFlightNumber,
  knownMode,
  mapsSearchUrl,
  modeLabel,
  whereLabel,
  type TransportMode,
  type TravelSide,
} from "@journiful/shared/utils";

interface TripCalendarData {
  trip: Trip;
  events: Event[];
  accommodations: Accommodation[];
  /**
   * The viewer's own legs on this trip — never a co-member's.
   *
   * Travel hangs off a member row, not off the trip, and the feed is one
   * person's calendar: a co-traveller's flight is not the subscriber's
   * occupation, and an event for it would tell them they are busy when
   * they are not. So this is the caller's `members.id` rows and nothing
   * else, which is why `getCalendarTripsAndEvents` reads it from the
   * member rows it has already resolved rather than from the trip ids.
   *
   * Already filtered: no tombstones. A leg is deleted, not muted (there
   * is no per-leg switch), so a soft-deleted row is absent rather than
   * hidden by the renderer.
   */
  travel: MemberTravel[];
}

export interface ICalendarService {
  getUserByCalendarToken(token: string): Promise<User | null>;
  getCalendarTripsAndEvents(userId: string): Promise<TripCalendarData[]>;
  generateIcsFeed(tripsWithEvents: TripCalendarData[]): string;
  enableCalendar(userId: string): Promise<string>;
  disableCalendar(userId: string): Promise<void>;
  regenerateCalendar(userId: string): Promise<string>;
  getCalendarToken(userId: string): Promise<string | null>;
  updateTripCalendarExclusion(
    userId: string,
    tripId: string,
    excluded: boolean,
  ): Promise<void>;
}

/**
 * Convert a UTC Date to a "fake" Date whose local getters (getHours, etc.)
 * return the wall-clock values in the target timezone. This is needed because
 * ical-generator reads date components via local getters and stamps TZID on them.
 */
function toTimezoneDate(utcDate: Date, timezone: string): Date {
  const local = utcDate.toLocaleString("en-US", { timeZone: timezone });
  return new Date(local);
}

/**
 * The emoji a leg wears in the calendar, one per mode, beside the stay's
 * 🏨.
 *
 * The calendar's own presentation, deliberately not in `shared`: the app's
 * board names a mode with a word and a chip, and a table every surface
 * reads would make an emoji someone else's commitment. The six are the
 * column's own modes (`member_travel_transport_mode`, built from
 * `TRANSPORT_MODES`), so the map is total over what a row can carry today
 * and needs no fallback row of its own: the read goes through the words'
 * `knownMode`, the one guard that turns a mode it has no row for into
 * `flight`. That window is not hypothetical — a mode retired from
 * `TRANSPORT_MODES` leaves its old value in the Postgres enum until a
 * migration rewrites the column, and a summary reading `undefined Flight
 * to LIS T1` is plausible enough to ship.
 *
 * A hire reads as the car you drive away in: 🚙, with the counter named by
 * the leg's own words (`Pickup at`). `other` is a taxi because a leg filed
 * as "something else" is, in practice, the ride nobody put a mode on.
 */
const TRAVEL_EMOJI: Record<TransportMode, string> = {
  flight: "✈️",
  train: "🚆",
  bus: "🚌",
  car: "🚗",
  rental: "🚙",
  other: "🚕",
};

/** The hour a leg brackets around the one end it filed. */
const TRAVEL_BRACKET_MS = 60 * 60 * 1000;

/**
 * One filed leg, as one event — D5's span and D6's words.
 *
 * **Spans when both ends are known**, because a leg is a block of time you
 * cannot be somewhere else for; a calendar that only marked each end
 * could not answer "am I free at 9am". **Brackets** an hour when the
 * member filed only one end: an arrival ends at the landing it was filed
 * with, a departure starts at the takeoff. An inverted pair falls back on
 * the same hour an event with no end uses, which is the honest answer —
 * the duration is missing, not negative.
 *
 * The event is **busy**, unlike the trip block and the stay: those are
 * context, a leg is occupation.
 *
 * `LOCATION` is the end you end up at (arrival, else departure), because a
 * week view shows it and makes it tappable; the description is the only
 * place both ends can be offered, one `Open in Maps` line per end that has
 * a where, labelled with the same words the form and the sheet use
 * (`whereLabel`, so a hire's far end reads `Pickup at`).
 *
 * A row with neither end makes no event: there is no time to place it at,
 * and no place to name it after.
 */
function travelEvent(
  calendar: ICalCalendar,
  trip: Trip,
  travel: MemberTravel,
  timezone: string,
): void {
  const { departureTime, arrivalTime } = travel;

  let start: Date;
  let end: Date;
  if (departureTime && arrivalTime) {
    start = departureTime;
    end = arrivalTime;
    if (end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + TRAVEL_BRACKET_MS);
    }
  } else if (arrivalTime) {
    // The hour spent travelling into the landing.
    end = arrivalTime;
    start = new Date(arrivalTime.getTime() - TRAVEL_BRACKET_MS);
  } else if (departureTime) {
    start = departureTime;
    end = new Date(departureTime.getTime() + TRAVEL_BRACKET_MS);
  } else {
    return;
  }

  const mode = travel.transportMode;

  // The ends the member filed a where for, departure side first so the two
  // lines read in the order the leg happens.
  const ends: { side: TravelSide; location: string }[] = [];
  if (travel.departureLocation) {
    ends.push({ side: "departure", location: travel.departureLocation });
  }
  if (travel.arrivalLocation) {
    ends.push({ side: "arrival", location: travel.arrivalLocation });
  }

  // Both halves of the title read through the one guard: the words' table
  // guards itself, so the map keyed by the same mode has to as well.
  const known = knownMode(mode);
  const name = `${TRAVEL_EMOJI[known]} ${modeLabel(mode)}`;
  const arrival = ends.find((end) => end.side === "arrival");
  const departure = ends.find((end) => end.side === "departure");
  let summary = name;
  if (arrival) {
    summary = `${name} to ${arrival.location}`;
  } else if (departure) {
    summary = `${name} from ${departure.location}`;
  }

  const descriptionParts: string[] = [];

  const number = travel.flightNumber?.trim();
  if (number) {
    // The flight's is the one number the app formats (the sheet's own
    // rule); a train's, a bus's or a hire's is prose the member typed, and
    // running it through the airline formatter would mangle it.
    descriptionParts.push(
      mode === "flight" ? formatFlightNumber(number) : number,
    );
  }

  if (travel.details) {
    descriptionParts.push(travel.details);
  }

  if (ends.length > 0) {
    descriptionParts.push(
      "Open in Maps:\n" +
        ends
          .map(
            ({ side, location }) =>
              `${whereLabel(mode, side, side !== travel.travelType)}: ${location} — ${mapsSearchUrl(location)}`,
          )
          .join("\n"),
    );
  }

  descriptionParts.push(`View trip: https://journiful.app/trips?id=${trip.id}`);

  calendar.createEvent({
    id: `travel-${travel.id}@journiful.app`,
    summary,
    description: descriptionParts.join("\n\n"),
    location: travel.arrivalLocation || travel.departureLocation || null,
    start: toTimezoneDate(start, timezone),
    end: toTimezoneDate(end, timezone),
    timezone,
    lastModified: travel.updatedAt,
    categories: [{ name: "travel" }],
    x: [{ key: "X-JOURNIFUL-TRIP", value: trip.name }],
  });
}

export class CalendarService implements ICalendarService {
  constructor(private db: AppDatabase) {}

  async getUserByCalendarToken(token: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.calendarToken, token),
          // The feed is the one surface where the token *is* the credential:
          // it runs no `authenticate`, so no `checkBanned` either, and a
          // banned account's URL would otherwise keep serving its trips to
          // whoever holds the link. Filtering here rather than nulling the
          // column on ban is the smaller fix of the two and the reversible
          // one: a ban can be lifted, and an unban puts the subscription back
          // instead of leaving a dead ICS URL on the user's calendar.
          eq(users.status, "active"),
          // Deletion already nulls the token; this is the same condition
          // stated where it is enforced, so a future writer who forgets the
          // tombstone still cannot serve the feed.
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    return user ?? null;
  }

  async getCalendarTripsAndEvents(userId: string): Promise<TripCalendarData[]> {
    // Get all trips where user is a member, not excluded from calendar, and not "not_going".
    // The member row's own id is selected too: it is what scopes the travel
    // read below to this caller, and it is the only handle on "mine".
    const memberRows = await this.db
      .select({
        id: members.id,
        tripId: members.tripId,
      })
      .from(members)
      .where(
        and(
          eq(members.userId, userId),
          eq(members.calendarExcluded, false),
          ne(members.status, "not_going"),
        ),
      );

    if (memberRows.length === 0) return [];

    const tripIds = memberRows.map((m) => m.tripId);
    const memberIds = memberRows.map((m) => m.id);

    // Batch-fetch all non-cancelled trips
    const tripRows = await this.db
      .select()
      .from(trips)
      .where(and(inArray(trips.id, tripIds), eq(trips.cancelled, false)));

    if (tripRows.length === 0) return [];

    const activeTripIds = tripRows.map((t) => t.id);

    // Batch-fetch all non-deleted events for those trips
    const eventRows = await this.db
      .select()
      .from(events)
      .where(
        and(inArray(events.tripId, activeTripIds), isNull(events.deletedAt)),
      );

    // Batch-fetch all non-deleted accommodations for those trips
    const accommodationRows = await this.db
      .select()
      .from(accommodations)
      .where(
        and(
          inArray(accommodations.tripId, activeTripIds),
          isNull(accommodations.deletedAt),
        ),
      );

    // Batch-fetch the caller's own non-deleted travel rows. Scoped by member
    // id rather than by trip id on purpose: on a trip the caller shares with
    // eight people, a trip-scoped read is eight other people's legs in their
    // calendar. The tombstone check is here because a feed request never runs
    // the travel service, which is the only other place that filters it.
    const travelRows = await this.db
      .select()
      .from(memberTravel)
      .where(
        and(
          inArray(memberTravel.memberId, memberIds),
          isNull(memberTravel.deletedAt),
        ),
      );

    // Group events by tripId
    const eventsByTrip = new Map<string, Event[]>();
    for (const event of eventRows) {
      const list = eventsByTrip.get(event.tripId) ?? [];
      list.push(event);
      eventsByTrip.set(event.tripId, list);
    }

    // Group accommodations by tripId
    const accommodationsByTrip = new Map<string, Accommodation[]>();
    for (const acc of accommodationRows) {
      const list = accommodationsByTrip.get(acc.tripId) ?? [];
      list.push(acc);
      accommodationsByTrip.set(acc.tripId, list);
    }

    // Group the caller's travel by tripId. Rows on a trip that did not
    // survive the cancelled filter above simply have no trip to land on.
    const travelByTrip = new Map<string, MemberTravel[]>();
    for (const travel of travelRows) {
      const list = travelByTrip.get(travel.tripId) ?? [];
      list.push(travel);
      travelByTrip.set(travel.tripId, list);
    }

    return tripRows.map((trip) => ({
      trip,
      events: eventsByTrip.get(trip.id) ?? [],
      accommodations: accommodationsByTrip.get(trip.id) ?? [],
      travel: travelByTrip.get(trip.id) ?? [],
    }));
  }

  generateIcsFeed(tripsWithEvents: TripCalendarData[]): string {
    const calendar = ical({
      name: "Journiful",
      method: ICalCalendarMethod.PUBLISH,
      prodId: { company: "journiful", product: "calendar", language: "EN" },
      x: [
        { key: "X-PUBLISHED-TTL", value: "PT15M" },
        {
          key: "X-REFRESH-INTERVAL;VALUE=DURATION",
          value: "PT15M",
        },
      ],
    });

    for (const {
      trip,
      events: tripEvents,
      accommodations: tripAccommodations,
      travel: tripTravel,
    } of tripsWithEvents) {
      const timezone = trip.preferredTimezone || "UTC";

      // Trip overview event (all-day, multi-day) — skip if no startDate
      if (trip.startDate) {
        const startDate = new Date(trip.startDate + "T00:00:00");
        // ICS exclusive end: add 1 day
        const endDate = trip.endDate
          ? new Date(trip.endDate + "T00:00:00")
          : startDate;
        const exclusiveEnd = new Date(endDate);
        exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);

        const description = [
          trip.description,
          `\nView trip: https://journiful.app/trips?id=${trip.id}`,
        ]
          .filter(Boolean)
          .join("\n");

        calendar.createEvent({
          id: `trip-${trip.id}@journiful.app`,
          summary: trip.name,
          description,
          location: trip.destination,
          start: startDate,
          end: exclusiveEnd,
          allDay: true,
          transparency: ICalEventTransparency.TRANSPARENT,
          url: `https://journiful.app/trips?id=${trip.id}`,
        });
      }

      // Individual trip events
      for (const event of tripEvents) {
        const descriptionParts: string[] = [];

        // Description
        if (event.description) {
          descriptionParts.push(event.description);
        }

        // Links
        if (event.links && event.links.length > 0) {
          descriptionParts.push(
            "Links:\n" +
              event.links
                .map((l) => (l.name ? `- ${l.name}: ${l.url}` : `- ${l.url}`))
                .join("\n"),
          );
        }

        const description = descriptionParts.join("\n\n") || null;
        const location = event.location || null;

        if (event.allDay) {
          calendar.createEvent({
            id: `event-${event.id}@journiful.app`,
            summary: event.name,
            description,
            location,
            start: event.startTime,
            end: event.endTime || event.startTime,
            allDay: true,
            lastModified: event.updatedAt,
            categories: [{ name: event.eventType }],
            x: [{ key: "X-JOURNIFUL-TRIP", value: trip.name }],
          });
        } else {
          const endTime =
            event.endTime ||
            new Date(event.startTime.getTime() + 60 * 60 * 1000);
          calendar.createEvent({
            id: `event-${event.id}@journiful.app`,
            summary: event.name,
            description,
            location,
            start: toTimezoneDate(event.startTime, timezone),
            end: toTimezoneDate(endTime, timezone),
            timezone,
            lastModified: event.updatedAt,
            categories: [{ name: event.eventType }],
            x: [{ key: "X-JOURNIFUL-TRIP", value: trip.name }],
          });
        }
      }

      // Accommodation events
      for (const acc of tripAccommodations) {
        if (!acc.checkIn || !acc.checkOut) continue;

        const descriptionParts: string[] = [];

        if (acc.description) {
          descriptionParts.push(acc.description);
        }

        if (acc.links && acc.links.length > 0) {
          descriptionParts.push(
            "Links:\n" +
              acc.links
                .map((l) => (l.name ? `- ${l.name}: ${l.url}` : `- ${l.url}`))
                .join("\n"),
          );
        }

        descriptionParts.push(
          `View trip: https://journiful.app/trips?id=${trip.id}`,
        );

        const description = descriptionParts.join("\n\n");

        calendar.createEvent({
          id: `accommodation-${acc.id}@journiful.app`,
          summary: `🏨 ${acc.name}`,
          description,
          location: acc.address,
          start: toTimezoneDate(acc.checkIn, timezone),
          end: toTimezoneDate(acc.checkOut, timezone),
          timezone,
          transparency: ICalEventTransparency.TRANSPARENT,
          categories: [{ name: "accommodation" }],
          x: [{ key: "X-JOURNIFUL-TRIP", value: trip.name }],
        });
      }

      // The viewer's own legs — one event per filed row, after the stays, so
      // the feed reads trip, then what happens at it, then how you got there.
      for (const travel of tripTravel) {
        travelEvent(calendar, trip, travel, timezone);
      }
    }

    return calendar.toString();
  }

  async enableCalendar(userId: string): Promise<string> {
    const existing = await this.getCalendarToken(userId);
    if (existing) return existing;
    return this.setCalendarToken(userId, randomUUID());
  }

  async disableCalendar(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ calendarToken: null, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async regenerateCalendar(userId: string): Promise<string> {
    const existing = await this.getCalendarToken(userId);
    if (!existing) {
      throw { statusCode: 409, message: "Calendar sync is not enabled" };
    }
    return this.setCalendarToken(userId, randomUUID());
  }

  private async setCalendarToken(
    userId: string,
    token: string,
  ): Promise<string> {
    await this.db
      .update(users)
      .set({ calendarToken: token, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return token;
  }

  async getCalendarToken(userId: string): Promise<string | null> {
    const [user] = await this.db
      .select({ calendarToken: users.calendarToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user?.calendarToken ?? null;
  }

  async updateTripCalendarExclusion(
    userId: string,
    tripId: string,
    excluded: boolean,
  ): Promise<void> {
    const result = await this.db
      .update(members)
      .set({ calendarExcluded: excluded, updatedAt: new Date() })
      .where(and(eq(members.userId, userId), eq(members.tripId, tripId)))
      .returning({ id: members.id });

    if (result.length === 0) {
      throw { statusCode: 404, message: "Trip membership not found" };
    }
  }
}
