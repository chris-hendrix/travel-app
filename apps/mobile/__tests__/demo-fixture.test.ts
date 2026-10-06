import { describe, expect, it } from "vitest";
import { DEMO_VIEWER_MEMBER_ID, buildDemoTrip, buildDemoTrips } from "@/lib/demo";

/**
 * The demo fixture's shape, pinned so the captured landing image stays
 * predictable. Content comes from the plan's demo-trip table only:
 * Cabo, Casa Verde with its door note, three days of events, four
 * timed arrivals twenty minutes apart, five answers, mid-planning
 * (one unanswered, one maybe, no cover photo), bundled placeholder
 * kinds, reserved 555 numbers, no remote URL.
 */
describe("the demo fixture", () => {
  it("covers going, maybe and no_response across its members", () => {
    const trip = buildDemoTrip(new Date("2026-10-06T12:00:00.000Z"));
    const statuses = trip.members.map((member) => member.status);
    expect(statuses).toContain("going");
    expect(statuses).toContain("maybe");
    expect(statuses).toContain("no_response");
  });

  it("times at least two arrivals twenty minutes apart", () => {
    const trip = buildDemoTrip(new Date("2026-10-06T12:00:00.000Z"));
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
  });

  it("derives the Fri-Tue window from today instead of pinning it", () => {
    const earlyToday = new Date("2026-10-06T12:00:00.000Z");
    const lateToday = new Date("2026-10-13T12:00:00.000Z");
    const early = buildDemoTrip(earlyToday);
    const late = buildDemoTrip(lateToday);
    // A week later in, a week later out: the window moves with today.
    expect(early.startDate).not.toBe(late.startDate);
    const shift =
      (new Date(late.startDate).getTime() -
        new Date(early.startDate).getTime()) /
      86_400_000;
    expect(shift).toBe(7);
    for (const [trip, today] of [[early, earlyToday], [late, lateToday]] as const) {
      // Friday to Tuesday, roughly eight weeks out.
      expect(new Date(`${trip.startDate}T12:00:00.000Z`).getUTCDay()).toBe(5);
      const span =
        (new Date(trip.endDate).getTime() -
          new Date(trip.startDate).getTime()) /
        86_400_000;
      expect(span).toBe(4);
      const out =
        (new Date(trip.startDate).getTime() - today.getTime()) / 86_400_000;
      expect(out).toBeGreaterThanOrEqual(56);
      expect(out).toBeLessThanOrEqual(62);
      // Every dated row falls inside the window.
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
  });

  it("uses only reserved 555 numbers", () => {
    const trip = buildDemoTrip(new Date("2026-10-06T12:00:00.000Z"));
    const phones = trip.members.flatMap((member) =>
      [member.phone, member.guestPhone].filter(
        (phone): phone is string => !!phone,
      ),
    );
    expect(phones.length).toBeGreaterThan(0);
    for (const phone of phones) expect(phone).toContain("555");
  });

  it("carries no remote URL anywhere", () => {
    const trip = buildDemoTrip(new Date("2026-10-06T12:00:00.000Z"));
    const dump = JSON.stringify(trip);
    expect(dump).not.toContain("http://");
    expect(dump).not.toContain("https://");
  });
});

describe("the demo list", () => {
  const today = new Date("2026-10-06T12:00:00.000Z");

  it("holds the Cabo trip first, then wholly invented trips", () => {
    const trips = buildDemoTrips(today);
    expect(trips.length).toBeGreaterThanOrEqual(2);
    expect(trips.length).toBeLessThanOrEqual(3);
    expect(trips[0]!.title).toBe("Cabo");
    const ids = trips.map((trip) => trip.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reads every viewer as the same going demo-viewer account", () => {
    for (const trip of buildDemoTrips(today)) {
      const viewer = trip.members.find(
        (member) => member.id === trip.viewerMemberId,
      );
      expect(viewer?.userId).toBe("demo-viewer");
      expect(viewer?.status).toBe("going");
      expect(trip.viewerMemberId).toBe(DEMO_VIEWER_MEMBER_ID);
    }
  });

  it("keeps every privacy rule on every trip", () => {
    for (const trip of buildDemoTrips(today)) {
      const phones = trip.members.flatMap((member) =>
        [member.phone, member.guestPhone].filter(
          (phone): phone is string => !!phone,
        ),
      );
      expect(phones.length).toBeGreaterThan(0);
      for (const phone of phones) expect(phone).toContain("555");
      const dump = JSON.stringify(trip);
      expect(dump).not.toContain("http://");
      expect(dump).not.toContain("https://");
      // Every dated row falls inside its own window.
      const dates = [
        ...trip.events.map((event) => event.startTime.slice(0, 10)),
        ...(trip.stay.checkIn ? [trip.stay.checkIn.slice(0, 10)] : []),
        ...(trip.stay.checkOut ? [trip.stay.checkOut.slice(0, 10)] : []),
        ...trip.travel
          .map((record) => record.arrivalTime?.slice(0, 10) ?? null)
          .filter((date): date is string => date !== null),
      ];
      expect(dates.length).toBeGreaterThan(0);
      for (const date of dates) {
        expect(date >= trip.startDate && date <= trip.endDate).toBe(true);
      }
    }
  });
});
