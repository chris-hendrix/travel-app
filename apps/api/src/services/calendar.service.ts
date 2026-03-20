import { randomUUID } from "node:crypto";
import { eq, and, isNull, ne, inArray } from "drizzle-orm";
import ical, {
  ICalCalendarMethod,
  ICalEventTransparency,
} from "ical-generator";
import {
  users,
  members,
  trips,
  events,
  accommodations,
  type User,
  type Trip,
  type Event,
  type Accommodation,
} from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";

interface TripCalendarData {
  trip: Trip;
  events: Event[];
  accommodations: Accommodation[];
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

export class CalendarService implements ICalendarService {
  constructor(private db: AppDatabase) {}

  async getUserByCalendarToken(token: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.calendarToken, token))
      .limit(1);
    return user ?? null;
  }

  async getCalendarTripsAndEvents(userId: string): Promise<TripCalendarData[]> {
    // Get all trips where user is a member, not excluded from calendar, and not "not_going"
    const memberRows = await this.db
      .select({
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

    return tripRows.map((trip) => ({
      trip,
      events: eventsByTrip.get(trip.id) ?? [],
      accommodations: accommodationsByTrip.get(trip.id) ?? [],
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
          `\nView trip: https://journiful.app/trips/${trip.id}`,
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
          url: `https://journiful.app/trips/${trip.id}`,
        });
      }

      // Individual trip events
      for (const event of tripEvents) {
        const descriptionParts: string[] = [];

        // Meetup info
        if (event.meetupTime || event.meetupLocation) {
          const meetupParts: string[] = [];
          if (event.meetupTime) {
            meetupParts.push(
              event.meetupTime.toLocaleString("en-US", {
                timeZone: timezone,
                hour: "numeric",
                minute: "2-digit",
              }),
            );
          }
          if (event.meetupLocation) {
            meetupParts.push(`at ${event.meetupLocation}`);
          }
          descriptionParts.push(`Meetup: ${meetupParts.join(" ")}`);
        }

        // Description
        if (event.description) {
          descriptionParts.push(event.description);
        }

        // Links
        if (event.links && event.links.length > 0) {
          descriptionParts.push(
            "Links:\n" + event.links.map((l) => `- ${l}`).join("\n"),
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
        const descriptionParts: string[] = [];

        if (acc.description) {
          descriptionParts.push(acc.description);
        }

        if (acc.links && acc.links.length > 0) {
          descriptionParts.push(
            "Links:\n" + acc.links.map((l) => `- ${l}`).join("\n"),
          );
        }

        descriptionParts.push(
          `View trip: https://journiful.app/trips/${trip.id}`,
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
