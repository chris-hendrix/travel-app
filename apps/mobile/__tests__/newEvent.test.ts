import { describe, expect, it } from "vitest";
import {
  buildEvent,
  draftFromEvent,
  validateNewEvent,
  type NewEventInput,
} from "@/lib/newEvent";
import type { ItineraryEvent } from "@/lib/itinerary";

const INPUT: NewEventInput = {
  name: "Dinner in town",
  description: "Table for eight under the vines.",
  day: "2026-09-20",
  allDay: false,
  start: "20:30",
  end: "22:30",
  place: "Trattoria Nuova",
};

/** The same event with no time at all: the day is the event. */
const ALL_DAY: NewEventInput = { ...INPUT, allDay: true, start: "", end: "" };

describe("validateNewEvent", () => {
  it("passes a complete event", () => {
    expect(validateNewEvent(INPUT)).toEqual({});
  });

  it("passes an all-day event with no times at all", () => {
    expect(validateNewEvent(ALL_DAY)).toEqual({});
  });

  it("wants a start on an event that is not all day", () => {
    // The blank is the thing being asked about now: an empty start used
    // to mean all-day quietly, which is one state wearing two meanings.
    expect(validateNewEvent({ ...INPUT, start: "" }).start).toBeTruthy();
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
    const event = buildEvent(INPUT, "e1", "Europe/Madrid", "https://picsum.test/x");
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
      "UTC",
      "https://picsum.test/x",
    );
    expect(event.endTime).toBeNull();
  });

  it("carries an all-day event at its own midnight, and says so", () => {
    const event = buildEvent(ALL_DAY, "e1", "UTC", "https://picsum.test/x");
    // Midnight in a UTC+0 trip, and the flag that stops the itinerary
    // printing "12:00 AM" at whatever the heading already said.
    expect(event.startTime.slice(11, 16)).toBe("00:00");
    expect(event.allDay).toBe(true);
  });

  it("keeps the description, and reads a blank one as no description", () => {
    expect(buildEvent(INPUT, "e1", "UTC", "p.jpg").description).toBe(
      "Table for eight under the vines.",
    );
    expect(
      buildEvent({ ...INPUT, description: "   " }, "e1", "UTC", "p.jpg")
        .description,
    ).toBeNull();
  });

  it("builds a live event, never a deleted one", () => {
    expect(buildEvent(INPUT, "e1", "UTC", "p.jpg").deletedAt).toBeNull();
  });
});

describe("draftFromEvent", () => {
  /** Built through the same path the form uses, so the two agree. */
  const built = (over: Partial<NewEventInput> = {}): ItineraryEvent =>
    buildEvent({ ...INPUT, ...over }, "e1", "Europe/Madrid", "photo.jpg");

  it("gives the form back the wall clock the trip runs on", () => {
    // Stored as 18:30Z; in a UTC+2 trip that is the 20:30 that was typed.
    expect(draftFromEvent(built(), "Europe/Madrid")).toEqual({
      name: "Dinner in town",
      description: "Table for eight under the vines.",
      place: "Trattoria Nuova",
      day: "2026-09-20",
      allDay: false,
      start: "20:30",
      end: "22:30",
    });
  });

  it("gives an all-day event back as all day, with no clocks", () => {
    const draft = draftFromEvent(
      built({ allDay: true, start: "", end: "" }),
      "Europe/Madrid",
    );
    // Not "00:00": all-day is the answer, and a clock here would be a
    // time nobody chose.
    expect(draft.allDay).toBe(true);
    expect(draft.start).toBe("");
    expect(draft.end).toBe("");
    expect(draft.day).toBe("2026-09-20");
  });

  it("drops an end that was never set", () => {
    expect(draftFromEvent(built({ end: "" }), "Europe/Madrid").end).toBe("");
  });
});
