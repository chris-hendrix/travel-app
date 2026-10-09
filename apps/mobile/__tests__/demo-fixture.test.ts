import { describe, expect, it } from "vitest";
import { tripCountdown } from "@/lib/countdown";
import { wallClock } from "@/lib/timezone";
import {
  DEMO_TRIP_ID,
  DEMO_TRIP_IDS,
  buildDemoTrip,
  buildDemoTrips,
} from "@/lib/demo";

/**
 * The demo fixtures' shape, pinned so the three demo trips stay
 * predictable. Content comes from the plan's demo-trip table only:
 * Cabo, a Todos Santos wedding and a San Diego bachelor party, each
 * with its own stay, events, timed arrivals twenty minutes apart, five
 * answers, mid-planning (one unanswered, one maybe, no cover photo),
 * bundled placeholder kinds, reserved 555 numbers, no remote URL —
 * real places on every event, and globally unique row ids, because the
 * adapter resolves id-addressed writes by id alone.
 */
const TODAY = new Date("2026-10-06T12:00:00.000Z");

describe("the demo fixtures", () => {
  it("build three trips with distinct ids and distinct destination cities", () => {
    const trips = buildDemoTrips(TODAY);
    expect(trips).toHaveLength(3);
    expect(trips.map((trip) => trip.id)).toEqual([...DEMO_TRIP_IDS]);
    expect(new Set(trips.map((trip) => trip.id)).size).toBe(3);
    expect(new Set(trips.map((trip) => trip.location)).size).toBe(3);
    for (const trip of trips) {
      const statuses = trip.members.map((member) => member.status);
      expect(statuses).toContain("going");
      expect(statuses).toContain("maybe");
      expect(statuses).toContain("no_response");
    }
  });

  it("keeps every row id unique across the three trips", () => {
    const trips = buildDemoTrips(TODAY);
    const ids = trips.flatMap((trip) => [
      ...trip.members.map((member) => member.id),
      ...trip.events.map((event) => event.id),
      trip.stay.id,
      ...trip.travel.map((record) => record.id),
    ]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the Cabo row ids unchanged", () => {
    const [cabo] = buildDemoTrips(TODAY);
    expect(cabo!.id).toBe(DEMO_TRIP_ID);
    expect(cabo!.stay.id).toBe("demo-stay");
    expect(cabo!.events.map((event) => event.id)).toContain(
      "demo-event-tacos",
    );
    expect(cabo!.travel.map((record) => record.id)).toContain(
      "demo-travel-liz",
    );
  });

  it("holds every invariant except the window, for each trip", () => {
    for (const trip of buildDemoTrips(TODAY)) {
      // Timed arrivals twenty minutes apart.
      const times = trip.travel
        .filter((record) => record.travelType === "arrival")
        .map((record) => record.arrivalTime)
        .filter((time): time is string => time !== null)
        .sort();
      expect(times.length).toBeGreaterThanOrEqual(2);
      const gaps = times
        .slice(1)
        .map(
          (time, index) =>
            (new Date(time).getTime() - new Date(times[index]!).getTime()) /
            60_000,
        );
      for (const gap of gaps) expect(gap).toBe(20);
      // Reserved 555 numbers only.
      const phones = trip.members.flatMap((member) =>
        [member.phone, member.guestPhone].filter(
          (phone): phone is string => !!phone,
        ),
      );
      expect(phones.length).toBeGreaterThan(0);
      for (const phone of phones) expect(phone).toContain("555");
      // Invented prose, no remote URL anywhere.
      expect(typeof trip.description).toBe("string");
      expect(trip.description!.length).toBeGreaterThan(0);
      const dump = JSON.stringify(trip);
      expect(dump).not.toContain("http://");
      expect(dump).not.toContain("https://");
    }
  });

  it("gives each trip its own window, and each its own countdown", () => {
    const today = TODAY;
    const table = [
      // { tripIndex, weeksOut, startWeekday, spanDays }
      { index: 0, minOut: 56, maxOut: 62, weekday: 5, span: 4 },
      { index: 1, minOut: 84, maxOut: 90, weekday: 6, span: 3 },
      { index: 2, minOut: 21, maxOut: 27, weekday: 5, span: 2 },
    ] as const;
    const trips = buildDemoTrips(today);
    for (const row of table) {
      const trip = trips[row.index]!;
      expect(dayMoment(trip.startDate).getDay()).toBe(row.weekday);
      const span =
        (new Date(trip.endDate).getTime() -
          new Date(trip.startDate).getTime()) /
        86_400_000;
      expect(span).toBe(row.span);
      const out =
        (new Date(trip.startDate).getTime() - today.getTime()) / 86_400_000;
      expect(out).toBeGreaterThanOrEqual(row.minOut);
      expect(out).toBeLessThanOrEqual(row.maxOut);
      const dates = [
        ...trip.events.map((event) => wallClock(event.startTime, null).date),
        ...(trip.stay.checkIn
          ? [wallClock(trip.stay.checkIn, null).date]
          : []),
        ...(trip.stay.checkOut
          ? [wallClock(trip.stay.checkOut, null).date]
          : []),
        ...trip.travel
          .map((record) =>
            record.arrivalTime ? wallClock(record.arrivalTime, null).date : null,
          )
          .filter((date): date is string => date !== null),
      ];
      for (const date of dates) {
        expect(date >= trip.startDate && date <= trip.endDate).toBe(true);
      }
    }
    // The windows move with today.
    const later = buildDemoTrips(new Date("2026-10-13T12:00:00.000Z"));
    for (const [index, trip] of buildDemoTrips(today).entries()) {
      expect(later[index]!.startDate).not.toBe(trip.startDate);
    }
    // Three different countdown readings for free.
    const readings = trips.map(
      (trip) => tripCountdown(trip.startDate, trip.endDate, today),
    );
    expect(new Set(readings).size).toBe(3);
  });

  it("gives every event a real place to be, and every stay a name", () => {
    // The event detail's Where block reads the entity's own snapshot
    // columns and hides when both are blank, so an event with no
    // `placeName`/`placeAddress` is an event whose address silently
    // disappears. The two rentals are the exception by nature: a holiday
    // let has no Maps listing, so its name and address are invented — and
    // the events held there reuse them rather than inventing a third.
    for (const trip of buildDemoTrips(TODAY)) {
      expect(trip.stay.placeName).toBe(trip.stay.name);
      for (const event of trip.events) {
        expect(event.placeName?.trim()).toBeTruthy();
        expect(event.placeAddress?.trim()).toBeTruthy();
      }
      for (const event of trip.events.filter(
        (row) => row.placeName === trip.stay.name,
      )) {
        expect(event.placeAddress).toBe(trip.stay.address);
      }
    }
  });

  it("writes every time on the viewer's own wall clock", () => {
    // The demo carries no timezone, so a 19:00 dinner has to read 7:00 PM
    // in New York and in Lisbon alike. `wallClock` with a null zone is the
    // device's own clock, which is the frame the fixture builds in — so
    // this is the assertion that would catch a fixture built on UTC.
    // `clock` is the twenty-four-hour reading, which is the same shape the
    // fixture writes its times in, so the two can be compared literally.
    const clocks = buildDemoTrips(TODAY).map((trip) =>
      trip.events
        .filter((event) => !event.allDay)
        .map((event) => wallClock(event.startTime, null).clock),
    );
    expect(clocks).toEqual([
      ["19:00", "21:30", "09:00", "14:00", "19:30", "19:00"],
      ["19:00", "16:00", "18:00", "10:00"],
      ["18:00", "10:00", "13:00", "19:00", "21:30", "11:30"],
    ]);
    // And the days read back on the viewer's calendar, not UTC's.
    for (const trip of buildDemoTrips(TODAY)) {
      for (const event of trip.events) {
        const day = wallClock(event.startTime, null).date;
        expect(day >= trip.startDate && day <= trip.endDate).toBe(true);
      }
    }
  });

  it("still builds the single Cabo trip through the old builder", () => {
    const trip = buildDemoTrip(TODAY);
    expect(trip.id).toBe(DEMO_TRIP_ID);
    expect(dayMoment(trip.startDate).getDay()).toBe(5);
  });
});

/** Local noon, the frame the fixture builds its days in. */
function dayMoment(dayIso: string): Date {
  return new Date(`${dayIso}T12:00:00`);
}
