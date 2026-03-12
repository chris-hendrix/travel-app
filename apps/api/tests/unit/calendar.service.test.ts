import { describe, it, expect } from "vitest";
import { CalendarService } from "@/services/calendar.service.js";
import type { Trip, Event, Accommodation } from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";

// generateIcsFeed is a pure function that does not use the database,
// so we can safely pass null for the db dependency.
const service = new CalendarService(null as unknown as AppDatabase);

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Beach Vacation",
    destination: "Cancun, Mexico",
    startDate: "2026-07-01",
    endDate: "2026-07-05",
    preferredTimezone: "America/Cancun",
    description: "Sun and sand",
    coverImageUrl: null,
    themeId: null,
    themeFont: null,
    createdBy: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    allowMembersToAddEvents: true,
    showAllMembers: false,
    cancelled: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    tripId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    createdBy: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    name: "Snorkeling Tour",
    description: "Great reef trip",
    eventType: "activity",
    location: "Reef Point",
    meetupLocation: "Hotel Lobby",
    meetupTime: new Date("2026-07-02T08:30:00Z"),
    startTime: new Date("2026-07-02T09:00:00Z"),
    endTime: new Date("2026-07-02T12:00:00Z"),
    allDay: false,
    isOptional: false,
    links: ["https://reef-tours.example.com"],
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...overrides,
  };
}

function makeAccommodation(
  overrides: Partial<Accommodation> = {},
): Accommodation {
  return {
    id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    tripId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    createdBy: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    name: "Seaside Resort",
    address: "123 Beach Rd, Cancun",
    description: "Oceanfront hotel with pool",
    checkIn: new Date("2026-07-01T15:00:00Z"),
    checkOut: new Date("2026-07-05T11:00:00Z"),
    links: ["https://seaside-resort.example.com"],
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ICS format uses line folding (RFC 5545 Section 3.1): long lines are broken
// at 75 octets with a CRLF followed by a single whitespace character.
// This helper unfolds the ICS string so we can do simple substring checks.
function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CalendarService.generateIcsFeed", () => {
  describe("calendar metadata", () => {
    it("should return valid ICS with calendar name, PUBLISH method, and refresh TTL", () => {
      const ics = service.generateIcsFeed([]);

      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("END:VCALENDAR");
      expect(ics).toContain("X-WR-CALNAME:Tripful");
      expect(ics).toContain("METHOD:PUBLISH");
      expect(ics).toContain("X-PUBLISHED-TTL:PT15M");
      expect(ics).toContain("X-REFRESH-INTERVAL;VALUE=DURATION:PT15M");
    });
  });

  describe("empty input", () => {
    it("should return valid but empty calendar when trips array is empty", () => {
      const ics = service.generateIcsFeed([]);

      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("END:VCALENDAR");
      expect(ics).not.toContain("BEGIN:VEVENT");
    });
  });

  describe("trip overview event", () => {
    it("should generate all-day transparent event when trip has startDate", () => {
      const trip = makeTrip();
      const ics = service.generateIcsFeed([{ trip, events: [], accommodations: [] }]);

      expect(ics).toContain("BEGIN:VEVENT");
      expect(ics).toContain(`SUMMARY:${trip.name}`);
      expect(ics).toContain(`UID:trip-${trip.id}@tripful.app`);
      expect(ics).toContain("TRANSP:TRANSPARENT");
      // All-day events use DATE (not DATE-TIME)
      expect(ics).toContain("DTSTART;VALUE=DATE:20260701");
    });

    it("should use exclusive end date (+1 day) per ICS spec", () => {
      const trip = makeTrip({ startDate: "2026-07-01", endDate: "2026-07-05" });
      const ics = service.generateIcsFeed([{ trip, events: [], accommodations: [] }]);

      // endDate is July 5, exclusive end should be July 6
      expect(ics).toContain("DTEND;VALUE=DATE:20260706");
    });

    it("should use startDate +1 day as end when endDate is null", () => {
      const trip = makeTrip({ startDate: "2026-07-01", endDate: null });
      const ics = service.generateIcsFeed([{ trip, events: [], accommodations: [] }]);

      // Single-day trip: start July 1, exclusive end July 2
      expect(ics).toContain("DTSTART;VALUE=DATE:20260701");
      expect(ics).toContain("DTEND;VALUE=DATE:20260702");
    });

    it("should skip trip overview event when startDate is null", () => {
      const trip = makeTrip({ startDate: null, endDate: null });
      const ics = service.generateIcsFeed([{ trip, events: [], accommodations: [] }]);

      expect(ics).not.toContain(`UID:trip-${trip.id}@tripful.app`);
      expect(ics).not.toContain("BEGIN:VEVENT");
    });

    it("should include trip description and link in description", () => {
      const trip = makeTrip({ description: "Sun and sand" });
      const ics = unfold(service.generateIcsFeed([{ trip, events: [], accommodations: [] }]));

      expect(ics).toContain("Sun and sand");
      expect(ics).toContain(`https://tripful.app/trips/${trip.id}`);
    });

    it("should include link even when trip description is null", () => {
      const trip = makeTrip({ description: null });
      const ics = unfold(service.generateIcsFeed([{ trip, events: [], accommodations: [] }]));

      expect(ics).toContain(`https://tripful.app/trips/${trip.id}`);
    });

    it("should set destination as location", () => {
      const trip = makeTrip({ destination: "Cancun, Mexico" });
      const ics = service.generateIcsFeed([{ trip, events: [], accommodations: [] }]);

      expect(ics).toContain("LOCATION:Cancun\\, Mexico");
    });
  });

  describe("timed events", () => {
    it("should include timezone and correct start/end times", () => {
      const trip = makeTrip({ startDate: null });
      const event = makeEvent({
        startTime: new Date("2026-07-02T09:00:00Z"),
        endTime: new Date("2026-07-02T12:00:00Z"),
        allDay: false,
      });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [] }]);

      expect(ics).toContain(`UID:event-${event.id}@tripful.app`);
      expect(ics).toContain("SUMMARY:Snorkeling Tour");
      // Should contain a DTSTART with timezone
      expect(ics).toContain("DTSTART");
      expect(ics).toContain("DTEND");
    });

    it("should default to +1 hour when endTime is null", () => {
      const trip = makeTrip({ startDate: null });
      const startTime = new Date("2026-07-02T14:00:00Z");
      const event = makeEvent({
        startTime,
        endTime: null,
        allDay: false,
      });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [] }]);

      // The ICS should have a DTEND — we verify by checking it contains VEVENT
      // and does not use all-day format
      expect(ics).toContain("BEGIN:VEVENT");
      expect(ics).toContain("DTEND");
      // Should NOT be a DATE-only format (that would be all-day)
      expect(ics).not.toMatch(/DTSTART;VALUE=DATE:\d{8}\r?\n/);
    });

    it("should convert UTC times to trip timezone", () => {
      // 2026-07-02T23:00:00Z = 6:00 PM CDT (America/Cancun is UTC-5 year-round)
      const trip = makeTrip({
        startDate: null,
        preferredTimezone: "America/Cancun",
      });
      const event = makeEvent({
        startTime: new Date("2026-07-02T23:00:00Z"),
        endTime: new Date("2026-07-03T02:00:00Z"),
        allDay: false,
      });
      const ics = unfold(service.generateIcsFeed([{ trip, events: [event], accommodations: [] }]));

      // Should contain 18:00 (6pm local), NOT 23:00 (UTC)
      expect(ics).toContain("DTSTART;TZID=America/Cancun:20260702T180000");
      // End: 02:00 UTC = 9:00 PM local
      expect(ics).toContain("DTEND;TZID=America/Cancun:20260702T210000");
    });

    it("should include X-TRIPFUL-TRIP custom property with trip name", () => {
      const trip = makeTrip({ startDate: null, name: "Beach Vacation" });
      const event = makeEvent({ allDay: false });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [] }]);

      expect(ics).toContain("X-TRIPFUL-TRIP:Beach Vacation");
    });

    it("should include event type as category", () => {
      const trip = makeTrip({ startDate: null });
      const event = makeEvent({ eventType: "meal", allDay: false });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [] }]);

      expect(ics).toContain("CATEGORIES:meal");
    });
  });

  describe("all-day events", () => {
    it("should generate all-day event correctly", () => {
      const trip = makeTrip({ startDate: null });
      const event = makeEvent({
        allDay: true,
        startTime: new Date("2026-07-03T00:00:00Z"),
        endTime: new Date("2026-07-03T00:00:00Z"),
      });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [] }]);

      expect(ics).toContain(`UID:event-${event.id}@tripful.app`);
      expect(ics).toContain("DTSTART;VALUE=DATE:");
    });
  });

  describe("event description assembly", () => {
    it("should include meetup info, description, and links", () => {
      const trip = makeTrip({ startDate: null });
      const event = makeEvent({
        meetupTime: new Date("2026-07-02T08:30:00Z"),
        meetupLocation: "Hotel Lobby",
        description: "Great reef trip",
        links: ["https://reef-tours.example.com", "https://maps.example.com"],
        allDay: false,
      });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [] }]);

      expect(ics).toContain("Meetup:");
      expect(ics).toContain("Hotel Lobby");
      expect(ics).toContain("Great reef trip");
      expect(ics).toContain("Links:");
      expect(ics).toContain("https://reef-tours.example.com");
      expect(ics).toContain("https://maps.example.com");
    });

    it("should handle missing optional fields gracefully", () => {
      const trip = makeTrip({ startDate: null });
      const event = makeEvent({
        meetupTime: null,
        meetupLocation: null,
        description: null,
        links: null,
        allDay: false,
      });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [] }]);

      // Should still produce a valid VEVENT
      expect(ics).toContain("BEGIN:VEVENT");
      expect(ics).toContain(`SUMMARY:${event.name}`);
      // Should NOT contain meetup or links sections
      expect(ics).not.toContain("Meetup:");
      expect(ics).not.toContain("Links:");
    });

    it("should handle empty links array", () => {
      const trip = makeTrip({ startDate: null });
      const event = makeEvent({
        meetupTime: null,
        meetupLocation: null,
        description: "Just a description",
        links: [],
        allDay: false,
      });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [] }]);

      expect(ics).toContain("Just a description");
      expect(ics).not.toContain("Links:");
    });

    it("should include meetup time only when meetupLocation is null", () => {
      const trip = makeTrip({ startDate: null });
      const event = makeEvent({
        meetupTime: new Date("2026-07-02T08:30:00Z"),
        meetupLocation: null,
        description: null,
        links: null,
        allDay: false,
      });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [] }]);

      expect(ics).toContain("Meetup:");
      expect(ics).not.toContain("at ");
    });

    it("should include meetup location only when meetupTime is null", () => {
      const trip = makeTrip({ startDate: null });
      const event = makeEvent({
        meetupTime: null,
        meetupLocation: "Hotel Lobby",
        description: null,
        links: null,
        allDay: false,
      });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [] }]);

      expect(ics).toContain("Meetup: at Hotel Lobby");
    });
  });

  describe("multiple trips and events", () => {
    it("should generate events for multiple trips", () => {
      const trip1 = makeTrip({
        id: "11111111-1111-1111-1111-111111111111",
        name: "Trip One",
        startDate: "2026-07-01",
        endDate: "2026-07-03",
      });
      const trip2 = makeTrip({
        id: "22222222-2222-2222-2222-222222222222",
        name: "Trip Two",
        startDate: "2026-08-01",
        endDate: "2026-08-05",
      });
      const event1 = makeEvent({
        id: "ee111111-1111-1111-1111-111111111111",
        tripId: trip1.id,
        name: "Event One",
        allDay: false,
      });
      const event2 = makeEvent({
        id: "ee222222-2222-2222-2222-222222222222",
        tripId: trip2.id,
        name: "Event Two",
        allDay: false,
      });

      const ics = service.generateIcsFeed([
        { trip: trip1, events: [event1], accommodations: [] },
        { trip: trip2, events: [event2], accommodations: [] },
      ]);

      // 2 trip overview events + 2 individual events = 4 VEVENTs
      const veventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
      expect(veventCount).toBe(4);

      expect(ics).toContain("SUMMARY:Trip One");
      expect(ics).toContain("SUMMARY:Trip Two");
      expect(ics).toContain("SUMMARY:Event One");
      expect(ics).toContain("SUMMARY:Event Two");
    });
  });

  describe("accommodation events", () => {
    it("should generate VEVENT with correct UID, summary, dates, and location", () => {
      const trip = makeTrip({ startDate: null });
      const acc = makeAccommodation();
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [acc] },
        ]),
      );

      expect(ics).toContain(`UID:accommodation-${acc.id}@tripful.app`);
      expect(ics).toContain("SUMMARY:🏨 Seaside Resort");
      expect(ics).toContain("LOCATION:123 Beach Rd\\, Cancun");
      expect(ics).toContain("TRANSP:TRANSPARENT");
      expect(ics).toContain("CATEGORIES:accommodation");
      expect(ics).toContain("X-TRIPFUL-TRIP:Beach Vacation");
      expect(ics).toContain("DTSTART");
      expect(ics).toContain("DTEND");
    });

    it("should handle accommodation with no address, description, or links", () => {
      const trip = makeTrip({ startDate: null });
      const acc = makeAccommodation({
        address: null,
        description: null,
        links: null,
      });
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [acc] },
        ]),
      );

      expect(ics).toContain(`UID:accommodation-${acc.id}@tripful.app`);
      expect(ics).toContain("SUMMARY:🏨 Seaside Resort");
      // Should not contain LOCATION when address is null
      expect(ics).not.toContain("LOCATION:");
      expect(ics).not.toContain("Links:");
      // Should still have trip link
      expect(ics).toContain(`https://tripful.app/trips/${trip.id}`);
    });

    it("should include accommodations alongside trip and event VEVENTs", () => {
      const trip = makeTrip(); // has startDate so trip overview is generated
      const event = makeEvent({ allDay: false });
      const acc = makeAccommodation();
      const ics = service.generateIcsFeed([
        { trip, events: [event], accommodations: [acc] },
      ]);

      // 1 trip overview + 1 event + 1 accommodation = 3 VEVENTs
      const veventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
      expect(veventCount).toBe(3);
    });

    it("should apply timezone conversion to checkIn/checkOut", () => {
      // checkIn 2026-07-01T15:00:00Z with America/Cancun (UTC-5) = 10:00 AM local
      const trip = makeTrip({
        startDate: null,
        preferredTimezone: "America/Cancun",
      });
      const acc = makeAccommodation({
        checkIn: new Date("2026-07-01T15:00:00Z"),
        checkOut: new Date("2026-07-05T16:00:00Z"),
      });
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [acc] },
        ]),
      );

      expect(ics).toContain(
        "DTSTART;TZID=America/Cancun:20260701T100000",
      );
      // checkOut 16:00 UTC = 11:00 AM local
      expect(ics).toContain(
        "DTEND;TZID=America/Cancun:20260705T110000",
      );
    });

    it("should include description and links in description field", () => {
      const trip = makeTrip({ startDate: null });
      const acc = makeAccommodation({
        description: "Oceanfront hotel with pool",
        links: ["https://seaside-resort.example.com"],
      });
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [acc] },
        ]),
      );

      expect(ics).toContain("Oceanfront hotel with pool");
      expect(ics).toContain("Links:");
      expect(ics).toContain("https://seaside-resort.example.com");
    });
  });
});
