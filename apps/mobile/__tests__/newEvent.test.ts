import { describe, expect, it } from "vitest";
import {
  buildEvent,
  validateNewEvent,
  type NewEventInput,
} from "@/lib/newEvent";

const INPUT: NewEventInput = {
  name: "Dinner in town",
  day: "2026-09-20",
  start: "20:30",
  end: "22:30",
  place: "Trattoria Nuova",
};

describe("validateNewEvent", () => {
  it("passes a complete event", () => {
    expect(validateNewEvent(INPUT)).toEqual({});
  });

  it("passes without either time — an event can be untimed", () => {
    expect(validateNewEvent({ ...INPUT, start: "", end: "" })).toEqual({});
  });

  it("passes with a start and no end", () => {
    expect(validateNewEvent({ ...INPUT, end: "" })).toEqual({});
  });

  it("requires a name, a day, and a place", () => {
    const errors = validateNewEvent({
      ...INPUT,
      name: "  ",
      day: "",
      place: "  ",
    });
    expect(errors.name).toBeTruthy();
    expect(errors.day).toBeTruthy();
    expect(errors.place).toBeTruthy();
  });

  it("rejects an end that is not after the start", () => {
    expect(validateNewEvent({ ...INPUT, end: "20:30" }).end).toBeTruthy();
    expect(validateNewEvent({ ...INPUT, end: "19:00" }).end).toBeTruthy();
  });
});

describe("buildEvent", () => {
  it("stamps the wall clock onto the trip clock", () => {
    const event = buildEvent(INPUT, "e1", 120, "https://picsum.test/x");
    // 20:30 in a UTC+2 trip is 18:30Z.
    expect(event.startTime).toBe("2026-09-20T18:30:00.000Z");
    expect(event.endTime).toBe("2026-09-20T20:30:00.000Z");
    expect(event.name).toBe("Dinner in town");
    expect(event.allDay).toBe(false);
    // The type is the place's, which the API reads off Places. Undecided
    // until then, so an authored event is unclassified.
    expect(event.type).toBe("misc");
  });

  it("leaves the end null when none is given", () => {
    const event = buildEvent(
      { ...INPUT, end: "" },
      "e1",
      0,
      "https://picsum.test/x",
    );
    expect(event.endTime).toBeNull();
  });

  it("carries an untimed event as all-day at its own midnight", () => {
    const event = buildEvent(
      { ...INPUT, start: "", end: "" },
      "e1",
      0,
      "https://picsum.test/x",
    );
    // Midnight in a UTC+0 trip, and the flag that stops the itinerary
    // printing "12:00 AM" at whatever the heading already said.
    expect(event.startTime.slice(11, 16)).toBe("00:00");
    expect(event.allDay).toBe(true);
  });
});
