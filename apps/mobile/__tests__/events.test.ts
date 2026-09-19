import { describe, expect, it } from "vitest";
import { eventsFor } from "@/mocks/events";
import { TRIPS } from "@/mocks/trips";
import { wallClock } from "@/lib/timezone";

describe("eventsFor", () => {
  it("never puts the same event twice in a row", () => {
    for (const trip of TRIPS) {
      const names = eventsFor(trip).map((event) => event.name);
      for (let index = 1; index < names.length; index += 1) {
        expect(
          names[index] === names[index - 1],
          `${trip.id}: "${names[index]}" twice running`,
        ).toBe(false);
      }
    }
  });

  it("puts every event on a day the trip actually runs", () => {
    for (const trip of TRIPS) {
      for (const event of eventsFor(trip)) {
        // The trip's own zone: the mocks build morning events in the
        // zone the trip is in, so the device's date is the wrong ruler.
        const day = wallClock(event.startTime, trip.preferredTimezone).date;
        expect(day >= trip.startDate && day <= trip.endDate).toBe(true);
      }
    }
  });

  it("gives a trip its own itinerary, not another trip's", () => {
    const picos = eventsFor(TRIPS.find((trip) => trip.id === "picos")!);
    const lisbon = eventsFor(TRIPS.find((trip) => trip.id === "lisbon")!);
    expect(picos.map((e) => e.name)).not.toEqual(lisbon.map((e) => e.name));
  });
});
