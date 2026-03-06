import { randomUUID } from "node:crypto";
import { eq, and, isNull, ne } from "drizzle-orm";
import ical, {
  ICalCalendarMethod,
  ICalEventTransparency,
} from "ical-generator";
import {
  users,
  members,
  trips,
  events,
  type User,
  type Trip,
  type Event,
} from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";

interface TripWithEvents {
  trip: Trip;
  events: Event[];
}

export interface ICalendarService {
  getUserByCalendarToken(token: string): Promise<User | null>;
  getCalendarTripsAndEvents(userId: string): Promise<TripWithEvents[]>;
  generateIcsFeed(tripsWithEvents: TripWithEvents[]): string;
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

  async getCalendarTripsAndEvents(userId: string): Promise<TripWithEvents[]> {
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

    // Fetch trips and their non-deleted events
    const result: TripWithEvents[] = [];

    for (const tripId of tripIds) {
      const [trip] = await this.db
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.cancelled, false)))
        .limit(1);

      if (!trip) continue;

      const tripEvents = await this.db
        .select()
        .from(events)
        .where(and(eq(events.tripId, tripId), isNull(events.deletedAt)));

      result.push({ trip, events: tripEvents });
    }

    return result;
  }

  generateIcsFeed(tripsWithEvents: TripWithEvents[]): string {
    const calendar = ical({
      name: "Tripful",
      method: ICalCalendarMethod.PUBLISH,
      prodId: { company: "tripful", product: "calendar", language: "EN" },
      x: [
        { key: "X-PUBLISHED-TTL", value: "PT15M" },
        {
          key: "REFRESH-INTERVAL;VALUE=DURATION",
          value: "PT15M",
        },
      ],
    });

    for (const { trip, events: tripEvents } of tripsWithEvents) {
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
          `\nView trip: https://tripful.app/trips/${trip.id}`,
        ]
          .filter(Boolean)
          .join("\n");

        calendar.createEvent({
          id: `trip-${trip.id}@tripful.app`,
          summary: trip.name,
          description,
          location: trip.destination,
          start: startDate,
          end: exclusiveEnd,
          allDay: true,
          transparency: ICalEventTransparency.TRANSPARENT,
          url: `https://tripful.app/trips/${trip.id}`,
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
            id: `event-${event.id}@tripful.app`,
            summary: event.name,
            description,
            location,
            start: event.startTime,
            end: event.endTime || event.startTime,
            allDay: true,
            lastModified: event.updatedAt,
            categories: [{ name: event.eventType }],
            x: [{ key: "X-TRIPFUL-TRIP", value: trip.name }],
          });
        } else {
          calendar.createEvent({
            id: `event-${event.id}@tripful.app`,
            summary: event.name,
            description,
            location,
            start: event.startTime,
            end:
              event.endTime ||
              new Date(event.startTime.getTime() + 60 * 60 * 1000),
            timezone,
            lastModified: event.updatedAt,
            categories: [{ name: event.eventType }],
            x: [{ key: "X-TRIPFUL-TRIP", value: trip.name }],
          });
        }
      }
    }

    return calendar.toString();
  }

  async enableCalendar(userId: string): Promise<string> {
    const token = randomUUID();
    await this.db
      .update(users)
      .set({ calendarToken: token, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return token;
  }

  async disableCalendar(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ calendarToken: null, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async regenerateCalendar(userId: string): Promise<string> {
    const token = randomUUID();
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
    await this.db
      .update(members)
      .set({ calendarExcluded: excluded, updatedAt: new Date() })
      .where(and(eq(members.userId, userId), eq(members.tripId, tripId)));
  }
}
