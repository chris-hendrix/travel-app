import { describe, expect, it } from "vitest";
import { tripCountdown } from "@/lib/countdown";
import {
  DEMO_TRIP_ID,
  DEMO_TRIP_IDS,
  buildDemoTrip,
  buildDemoTrips,
} from "@/lib/demo";

/**
 * The demo fixtures' shape, pinned so the three demo trips stay
 * predictable. Content comes from the plan's demo-trip table only:
 * Cabo, a Todos Santos wedding and a San Diego reunion, each with
 * its own stay, events, timed arrivals twenty minutes apart, five
 * answers, mid-planning (one unanswered, one maybe, no cover photo),
 * bundled placeholder kinds, reserved 555 numbers, no remote URL —
 * and globally unique row ids, because the adapter resolves
 * id-addressed writes by id alone.
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
      expect(
        new Date(`${trip.startDate}T12:00:00.000Z`).getUTCDay(),
      ).toBe(row.weekday);
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
        ...trip.events.map((event) => event.startTime.slice(0, 10)),
        ...(trip.stay.checkIn ? [trip.stay.checkIn.slice(0, 10)] : []),
        ...(trip.stay.checkOut ? [trip.stay.checkOut.slice(0, 10)] : []),
        ...trip.travel
          .map((record) => record.arrivalTime?.slice(0, 10) ?? null)
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

  it("still builds the single Cabo trip through the old builder", () => {
    const trip = buildDemoTrip(TODAY);
    expect(trip.id).toBe(DEMO_TRIP_ID);
    expect(new Date(`${trip.startDate}T12:00:00.000Z`).getUTCDay()).toBe(5);
  });
});
