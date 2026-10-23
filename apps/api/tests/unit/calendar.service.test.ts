import { describe, it, expect } from "vitest";
import { CalendarService } from "@/services/calendar.service.js";
import type {
  Trip,
  Event,
  Accommodation,
  MemberTravel,
} from "@/db/schema/index.js";
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
    eventType: "misc",
    location: "Reef Point",
    startTime: new Date("2026-07-02T09:00:00Z"),
    endTime: new Date("2026-07-02T12:00:00Z"),
    allDay: false,
    links: [{ url: "https://reef-tours.example.com" }],
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
    links: [{ url: "https://seaside-resort.example.com" }],
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** One filed leg, in the shape the calendar read hands the feed. */
function makeTravel(overrides: Partial<MemberTravel> = {}): MemberTravel {
  return {
    id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    tripId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    memberId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    travelType: "arrival",
    transportMode: "flight",
    departureLocation: "BCN T2",
    departureTime: new Date("2026-10-17T12:00:00Z"),
    arrivalLocation: "LIS T1",
    arrivalTime: new Date("2026-10-17T14:40:00Z"),
    details: "Seat 14A",
    flightNumber: "UA1842",
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
      expect(ics).toContain("X-WR-CALNAME:Journiful");
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
      const ics = service.generateIcsFeed([{ trip, events: [], accommodations: [], travel: [] }]);

      expect(ics).toContain("BEGIN:VEVENT");
      expect(ics).toContain(`SUMMARY:${trip.name}`);
      expect(ics).toContain(`UID:trip-${trip.id}@journiful.app`);
      expect(ics).toContain("TRANSP:TRANSPARENT");
      // All-day events use DATE (not DATE-TIME)
      expect(ics).toContain("DTSTART;VALUE=DATE:20260701");
    });

    it("should use exclusive end date (+1 day) per ICS spec", () => {
      const trip = makeTrip({ startDate: "2026-07-01", endDate: "2026-07-05" });
      const ics = service.generateIcsFeed([{ trip, events: [], accommodations: [], travel: [] }]);

      // endDate is July 5, exclusive end should be July 6
      expect(ics).toContain("DTEND;VALUE=DATE:20260706");
    });

    it("should use startDate +1 day as end when endDate is null", () => {
      const trip = makeTrip({ startDate: "2026-07-01", endDate: null });
      const ics = service.generateIcsFeed([{ trip, events: [], accommodations: [], travel: [] }]);

      // Single-day trip: start July 1, exclusive end July 2
      expect(ics).toContain("DTSTART;VALUE=DATE:20260701");
      expect(ics).toContain("DTEND;VALUE=DATE:20260702");
    });

    it("should skip trip overview event when startDate is null", () => {
      const trip = makeTrip({ startDate: null, endDate: null });
      const ics = service.generateIcsFeed([{ trip, events: [], accommodations: [], travel: [] }]);

      expect(ics).not.toContain(`UID:trip-${trip.id}@journiful.app`);
      expect(ics).not.toContain("BEGIN:VEVENT");
    });

    it("should include trip description and link in description", () => {
      const trip = makeTrip({ description: "Sun and sand" });
      const ics = unfold(service.generateIcsFeed([{ trip, events: [], accommodations: [], travel: [] }]));

      expect(ics).toContain("Sun and sand");
      expect(ics).toContain(`https://journiful.app/trips?id=${trip.id}`);
    });

    it("should include link even when trip description is null", () => {
      const trip = makeTrip({ description: null });
      const ics = unfold(service.generateIcsFeed([{ trip, events: [], accommodations: [], travel: [] }]));

      expect(ics).toContain(`https://journiful.app/trips?id=${trip.id}`);
    });

    it("should set destination as location", () => {
      const trip = makeTrip({ destination: "Cancun, Mexico" });
      const ics = service.generateIcsFeed([{ trip, events: [], accommodations: [], travel: [] }]);

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
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [], travel: [] }]);

      expect(ics).toContain(`UID:event-${event.id}@journiful.app`);
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
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [], travel: [] }]);

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
      const ics = unfold(service.generateIcsFeed([{ trip, events: [event], accommodations: [], travel: [] }]));

      // Should contain 18:00 (6pm local), NOT 23:00 (UTC)
      expect(ics).toContain("DTSTART;TZID=America/Cancun:20260702T180000");
      // End: 02:00 UTC = 9:00 PM local
      expect(ics).toContain("DTEND;TZID=America/Cancun:20260702T210000");
    });

    it("should include X-JOURNIFUL-TRIP custom property with trip name", () => {
      const trip = makeTrip({ startDate: null, name: "Beach Vacation" });
      const event = makeEvent({ allDay: false });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [], travel: [] }]);

      expect(ics).toContain("X-JOURNIFUL-TRIP:Beach Vacation");
    });

    it("should include event type as category", () => {
      const trip = makeTrip({ startDate: null });
      const event = makeEvent({ eventType: "food_and_drink", allDay: false });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [], travel: [] }]);

      expect(ics).toContain("CATEGORIES:food_and_drink");
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
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [], travel: [] }]);

      expect(ics).toContain(`UID:event-${event.id}@journiful.app`);
      expect(ics).toContain("DTSTART;VALUE=DATE:");
    });
  });

  describe("event description assembly", () => {
    it("should include description and links", () => {
      const trip = makeTrip({ startDate: null });
      const event = makeEvent({
        description: "Great reef trip",
        links: [
          { url: "https://reef-tours.example.com" },
          { url: "https://maps.example.com" },
        ],
        allDay: false,
      });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [], travel: [] }]);

      expect(ics).toContain("Great reef trip");
      expect(ics).toContain("Links:");
      expect(ics).toContain("https://reef-tours.example.com");
      expect(ics).toContain("https://maps.example.com");
    });

    it("should format named links as 'Name: url' and bare links as just url", () => {
      const trip = makeTrip({ startDate: null });
      const event = makeEvent({
        description: null,
        links: [
          { url: "https://reef-tours.example.com", name: "Reef Tours" },
          { url: "https://maps.example.com" },
        ],
        allDay: false,
      });
      const ics = unfold(
        service.generateIcsFeed([{ trip, events: [event], accommodations: [], travel: [] }]),
      );

      expect(ics).toContain("- Reef Tours: https://reef-tours.example.com");
      expect(ics).toContain("- https://maps.example.com");
      expect(ics).not.toContain("- https://reef-tours.example.com");
    });

    it("should handle missing optional fields gracefully", () => {
      const trip = makeTrip({ startDate: null });
      const event = makeEvent({
        description: null,
        links: null,
        allDay: false,
      });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [], travel: [] }]);

      // Should still produce a valid VEVENT
      expect(ics).toContain("BEGIN:VEVENT");
      expect(ics).toContain(`SUMMARY:${event.name}`);
      // Should NOT contain links section
      expect(ics).not.toContain("Links:");
    });

    it("should handle empty links array", () => {
      const trip = makeTrip({ startDate: null });
      const event = makeEvent({
        description: "Just a description",
        links: [],
        allDay: false,
      });
      const ics = service.generateIcsFeed([{ trip, events: [event], accommodations: [], travel: [] }]);

      expect(ics).toContain("Just a description");
      expect(ics).not.toContain("Links:");
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
        { trip: trip1, events: [event1], accommodations: [], travel: [] },
        { trip: trip2, events: [event2], accommodations: [], travel: [] },
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
          { trip, events: [], accommodations: [acc], travel: [] },
        ]),
      );

      expect(ics).toContain(`UID:accommodation-${acc.id}@journiful.app`);
      expect(ics).toContain("SUMMARY:🏨 Seaside Resort");
      expect(ics).toContain("LOCATION:123 Beach Rd\\, Cancun");
      expect(ics).toContain("TRANSP:TRANSPARENT");
      expect(ics).toContain("CATEGORIES:accommodation");
      expect(ics).toContain("X-JOURNIFUL-TRIP:Beach Vacation");
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
          { trip, events: [], accommodations: [acc], travel: [] },
        ]),
      );

      expect(ics).toContain(`UID:accommodation-${acc.id}@journiful.app`);
      expect(ics).toContain("SUMMARY:🏨 Seaside Resort");
      // Should not contain LOCATION when address is null
      expect(ics).not.toContain("LOCATION:");
      expect(ics).not.toContain("Links:");
      // Should still have trip link
      expect(ics).toContain(`https://journiful.app/trips?id=${trip.id}`);
    });

    it("should include accommodations alongside trip and event VEVENTs", () => {
      const trip = makeTrip(); // has startDate so trip overview is generated
      const event = makeEvent({ allDay: false });
      const acc = makeAccommodation();
      const ics = service.generateIcsFeed([
        { trip, events: [event], accommodations: [acc], travel: [] },
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
          { trip, events: [], accommodations: [acc], travel: [] },
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
        links: [{ url: "https://seaside-resort.example.com" }],
      });
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [acc], travel: [] },
        ]),
      );

      expect(ics).toContain("Oceanfront hotel with pool");
      expect(ics).toContain("Links:");
      expect(ics).toContain("https://seaside-resort.example.com");
    });

    it("should format named accommodation links as 'Name: url'", () => {
      const trip = makeTrip({ startDate: null });
      const acc = makeAccommodation({
        description: null,
        links: [
          { url: "https://airbnb.example.com/listing", name: "Airbnb" },
          { url: "https://maps.example.com/hotel" },
        ],
      });
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [acc], travel: [] },
        ]),
      );

      expect(ics).toContain("- Airbnb: https://airbnb.example.com/listing");
      expect(ics).toContain("- https://maps.example.com/hotel");
    });
  });

  /**
   * The viewer's own leg, in their calendar.
   *
   * One VEVENT per filed row (D5): a leg is a block of time you cannot be
   * somewhere else for, so it spans takeoff to landing and is **busy** —
   * unlike the trip block and the stay, which are context and say so with
   * `TRANSP:TRANSPARENT`. When the member filed only one end there is no
   * span to draw, and the event brackets an hour around the end they did
   * file: an arrival is the hour spent travelling *into* the landing, a
   * departure the hour travelling out of it.
   *
   * What it says is D6: the end you land at is the title and the location
   * (a week view shows both, and makes the location tappable), the number
   * and the prose go in the description, and each filed end is offered
   * there as a Google Maps search — one per end, since only that half of
   * the leg can be linked from a single `LOCATION`.
   */
  describe("travel events", () => {
    it("should span takeoff to landing as one busy event", () => {
      const trip = makeTrip({ startDate: null });
      const travel = makeTravel();
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [], travel: [travel] },
        ]),
      );

      expect(ics).toContain(`UID:travel-${travel.id}@journiful.app`);
      // 12:00Z → 07:00 in the trip's zone, 14:40Z → 09:40
      expect(ics).toContain("DTSTART;TZID=America/Cancun:20261017T070000");
      expect(ics).toContain("DTEND;TZID=America/Cancun:20261017T094000");
      expect(ics).toContain("CATEGORIES:travel");
      expect(ics).toContain("X-JOURNIFUL-TRIP:Beach Vacation");
      // A leg is occupation, not context: nobody else's calendar should be
      // told this person is free because the event was transparent.
      expect(ics).not.toContain("TRANSP:TRANSPARENT");
    });

    it("should name a mode it has no row for as a flight", () => {
      // The emoji map is total over today's `member_travel_transport_mode`,
      // but the guard is the words' `knownMode` and not the column: a mode
      // retired from `TRANSPORT_MODES` leaves its old value in the Postgres
      // enum until a migration rewrites it, and an ungated map read puts
      // `undefined Flight to LIS T1` in somebody's calendar — plausible
      // enough to ship, and unrecoverable for the reader.
      const trip = makeTrip({ startDate: null });
      const travel = makeTravel({
        transportMode: "teleport" as MemberTravel["transportMode"],
      });
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [], travel: [travel] },
        ]),
      );

      expect(ics).toContain("SUMMARY:✈️ Flight to LIS T1");
      expect(ics).not.toContain("undefined");
    });

    it("should make one event per filed row", () => {
      const trip = makeTrip({ startDate: null });
      const outbound = makeTravel({
        id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01",
        travelType: "departure",
        departureLocation: null,
        departureTime: null,
      });
      const home = makeTravel({
        id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02",
        travelType: "arrival",
        departureLocation: null,
        departureTime: null,
      });
      const ics = service.generateIcsFeed([
        { trip, events: [], accommodations: [], travel: [outbound, home] },
      ]);

      expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(2);
    });

    it("should name the event and the location for the end you land at", () => {
      const trip = makeTrip({ startDate: null });
      const travel = makeTravel();
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [], travel: [travel] },
        ]),
      );

      expect(ics).toContain("SUMMARY:✈️ Flight to LIS T1");
      expect(ics).toContain("LOCATION:LIS T1");
    });

    it("should fall back to the departure end when no landing is filed", () => {
      const trip = makeTrip({ startDate: null });
      const travel = makeTravel({ arrivalLocation: null });
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [], travel: [travel] },
        ]),
      );

      expect(ics).toContain("SUMMARY:✈️ Flight from BCN T2");
      expect(ics).toContain("LOCATION:BCN T2");
    });

    it("should wear the mode's own emoji, label and end words", () => {
      const trip = makeTrip({ startDate: null });
      const travel = makeTravel({
        transportMode: "train",
        arrivalLocation: "Lisboa Oriente",
        arrivalTime: new Date("2026-10-17T19:10:00Z"),
      });
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [], travel: [travel] },
        ]),
      );

      expect(ics).toContain("SUMMARY:🚆 Train to Lisboa Oriente");
      expect(ics).toContain("Departs from: BCN T2");
      expect(ics).toContain("Arrives at: Lisboa Oriente");
    });

    it("should describe the number, the details, a maps line per end and the trip", () => {
      const trip = makeTrip({ startDate: null });
      const travel = makeTravel();
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [], travel: [travel] },
        ]),
      );

      // Formatted, the way the record sheet writes it — not as filed.
      expect(ics).toContain("UA 1842");
      expect(ics).toContain("Seat 14A");
      expect(ics).toContain("Open in Maps:");
      expect(ics).toContain(
        "Leaves from: BCN T2 — https://www.google.com/maps/search/?api=1&query=BCN%20T2",
      );
      expect(ics).toContain(
        "Lands at: LIS T1 — https://www.google.com/maps/search/?api=1&query=LIS%20T1",
      );
      expect(ics).toContain(
        `View trip: https://journiful.app/trips?id=${trip.id}`,
      );
    });

    it("should write a number it cannot format as filed", () => {
      const trip = makeTrip({ startDate: null });
      // Only the flight's number has a format; a train's is prose the member
      // typed, and the formatter would mangle it ("FlixBus 42" → "FLI XBUS42").
      const travel = makeTravel({
        transportMode: "bus",
        flightNumber: "FlixBus 42",
      });
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [], travel: [travel] },
        ]),
      );

      expect(ics).toContain("FlixBus 42");
      expect(ics).not.toContain("FLI XBUS42");
    });

    it("should offer only the ends that have a where", () => {
      const trip = makeTrip({ startDate: null });
      const travel = makeTravel({ departureLocation: null });
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [], travel: [travel] },
        ]),
      );

      expect(ics).toContain("Open in Maps:");
      expect(ics).toContain("Lands at: LIS T1");
      expect(ics).not.toContain("Leaves from:");
    });

    it("should read a hire's counter end as the counter's errand", () => {
      const trip = makeTrip({ startDate: null });
      // A rental's *far* end is the desk: on an arrival row that is the
      // departure side, the counter the car was collected from.
      const travel = makeTravel({
        transportMode: "rental",
        departureLocation: "Hertz Lisbon Airport",
      });
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [], travel: [travel] },
        ]),
      );

      expect(ics).toContain("SUMMARY:🚙 Rental to LIS T1");
      expect(ics).toContain("Pickup at: Hertz Lisbon Airport");
    });

    it("should bracket an arrival with no takeoff back an hour", () => {
      const trip = makeTrip({ startDate: null });
      // The hour you spend travelling into a landing: 13:40Z → 14:40Z.
      const travel = makeTravel({
        departureLocation: null,
        departureTime: null,
      });
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [], travel: [travel] },
        ]),
      );

      expect(ics).toContain("DTSTART;TZID=America/Cancun:20261017T084000");
      expect(ics).toContain("DTEND;TZID=America/Cancun:20261017T094000");
    });

    it("should bracket a departure with no landing forward an hour", () => {
      const trip = makeTrip({ startDate: null });
      // The hour you spend travelling out of a takeoff: 12:00Z → 13:00Z.
      const travel = makeTravel({
        arrivalLocation: null,
        arrivalTime: null,
      });
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [], travel: [travel] },
        ]),
      );

      expect(ics).toContain("DTSTART;TZID=America/Cancun:20261017T070000");
      expect(ics).toContain("DTEND;TZID=America/Cancun:20261017T080000");
    });

    it("should fall back to an hour when the pair reads backwards", () => {
      const trip = makeTrip({ startDate: null });
      // A landing filed before its takeoff is the same missing duration the
      // events fall back on: the start plus an hour.
      const travel = makeTravel({
        arrivalTime: new Date("2026-10-17T11:00:00Z"),
      });
      const ics = unfold(
        service.generateIcsFeed([
          { trip, events: [], accommodations: [], travel: [travel] },
        ]),
      );

      expect(ics).toContain("DTSTART;TZID=America/Cancun:20261017T070000");
      expect(ics).toContain("DTEND;TZID=America/Cancun:20261017T080000");
    });

    it("should make no event for a row with neither end", () => {
      const trip = makeTrip({ startDate: null });
      const travel = makeTravel({
        departureLocation: null,
        departureTime: null,
        arrivalLocation: null,
        arrivalTime: null,
      });
      const ics = service.generateIcsFeed([
        { trip, events: [], accommodations: [], travel: [travel] },
      ]);

      expect(ics).not.toContain("BEGIN:VEVENT");
      expect(ics).not.toContain(`travel-${travel.id}`);
    });
  });
});
