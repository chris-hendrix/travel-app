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

  it("carries the picked place's type rather than forcing misc", () => {
    expect(
      buildEvent({ ...INPUT, type: "food_and_drink" }, "e1", "UTC", "p.jpg")
        .type,
    ).toBe("food_and_drink");
    expect(
      buildEvent({ ...INPUT, type: "misc" }, "e1", "UTC", "p.jpg").type,
    ).toBe("misc");
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
      type: "misc",
      locationLat: null,
      locationLon: null,
      placeId: null,
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

  it("carries a picked suggestion's coordinates into the create", () => {
    // The dialog hands the live lookup's coordinates on the input;
    // the built event keeps them, so the store's create sends them.
    const picked: NewEventInput = {
      ...INPUT,
      locationLat: 41.3,
      locationLon: 2.1,
    };
    const event = buildEvent(picked, "e1", "UTC", "p.jpg");
    expect(event.locationLat).toBe(41.3);
    expect(event.locationLon).toBe(2.1);
  });

  it("builds no coordinates when the place was typed", () => {
    // Typed prose and static picks submit bare: absent, never 0.
    const event = buildEvent(INPUT, "e1", "UTC", "p.jpg");
    expect(event.locationLat).toBeNull();
    expect(event.locationLon).toBeNull();
  });

  it("keeps the coordinates across an edit round-trip", () => {
    const event = buildEvent(
      { ...INPUT, locationLat: 41.3, locationLon: 2.1 },
      "e1",
      "UTC",
      "p.jpg",
    );
    const redrafted = draftFromEvent(event, "UTC");
    expect(redrafted.locationLat).toBe(41.3);
    expect(redrafted.locationLon).toBe(2.1);
    const rebuilt = buildEvent(redrafted, "e1", "UTC", "p.jpg");
    expect(rebuilt.locationLat).toBe(41.3);
    expect(rebuilt.locationLon).toBe(2.1);
  });
});

describe("event place link", () => {
  it("draftFromEvent carries an existing row's placeId back into the form", () => {
    const event: ItineraryEvent = buildEvent(INPUT, "e1", "UTC", "p.jpg");
    event.placeId = "ChIJKeens123";
    expect(draftFromEvent(event, "UTC").placeId).toBe("ChIJKeens123");
  });

  it("draftFromEvent reads a row with no link as a null placeId", () => {
    const { placeId: _dropped, ...unlinked } = buildEvent(
      INPUT,
      "e1",
      "UTC",
      "p.jpg",
    );
    expect(draftFromEvent(unlinked, "UTC").placeId).toBeNull();
  });

  it("buildEvent carries the picked placeId onto the local row", () => {
    const event = buildEvent(
      { ...INPUT, placeId: "ChIJKeens123" },
      "e1",
      "UTC",
      "p.jpg",
    );
    expect(event.placeId).toBe("ChIJKeens123");
  });

  it("buildEvent reads typed prose as a null placeId", () => {
    expect(buildEvent(INPUT, "e1", "UTC", "p.jpg").placeId).toBeNull();
  });
});

describe("event place snapshot", () => {
  it("buildEvent carries the picked name and address onto the local row", () => {
    const event = buildEvent(
      {
        ...INPUT,
        placeId: "ChIJKeens123",
        placeName: "Keens",
        placeAddress: "72 W 36th St, New York, NY 10018",
      },
      "e1",
      "UTC",
      "p.jpg",
    );
    expect(event.placeName).toBe("Keens");
    expect(event.placeAddress).toBe("72 W 36th St, New York, NY 10018");
  });

  it("buildEvent reads typed prose as null snapshots", () => {
    const event = buildEvent(
      { ...INPUT, placeName: null, placeAddress: null },
      "e1",
      "UTC",
      "p.jpg",
    );
    expect(event.placeName).toBeNull();
    expect(event.placeAddress).toBeNull();
  });

  it("buildEvent leaves untouched snapshots absent, so the store omits them", () => {
    const event = buildEvent(INPUT, "e1", "UTC", "p.jpg");
    expect(event.placeName).toBeUndefined();
    expect(event.placeAddress).toBeUndefined();
  });

  it("draftFromEvent carries an existing row's snapshot back into the form", () => {
    const event: ItineraryEvent = {
      ...buildEvent(INPUT, "e1", "UTC", "p.jpg"),
      placeId: "ChIJKeens123",
      placeName: "Keens",
      placeAddress: "72 W 36th St, New York, NY 10018",
    };
    expect(draftFromEvent(event, "UTC")).toMatchObject({
      placeId: "ChIJKeens123",
      placeName: "Keens",
      placeAddress: "72 W 36th St, New York, NY 10018",
    });
  });
});
