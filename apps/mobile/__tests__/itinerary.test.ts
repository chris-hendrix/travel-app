import { describe, expect, it } from "vitest";
import { getTimezoneAbbr } from "@journiful/shared/utils";
import {
  eventTimeLabel,  dayLabel,
  daysFrom,
  EVENT_TYPE_LABEL,
  groupEventsByDay,
  liveEvents,
  tripIsOver,
  withEdits,
  type EventType,
  type ItineraryEvent,
} from "@/lib/itinerary";

/** Fixed "today" as an ISO date, the shape the grouping and labels take. */
const today = "2026-09-19";

/** An event at a local wall-clock time on a given September day. */
function event(
  id: string,
  day: number,
  hour = 12,
  minute = 0,
  minutes = 60,
): ItineraryEvent {
  const start = new Date(2026, 8, day, hour, minute);
  return {
    id,
    name: id,
    type: "misc",
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + minutes * 60_000).toISOString(),
    allDay: false,
    description: null,
    place: "Somewhere",
    image: "photo.jpg",
    deletedAt: null,
  };
}

describe("groupEventsByDay", () => {
  it("runs the trip from its first day to its last", () => {
    const days = groupEventsByDay(
      [event("later", 21), event("today", 19), event("first", 17)],
      null,
    );

    expect(days.map((day) => day.date)).toEqual([
      "2026-09-17",
      "2026-09-19",
      "2026-09-21",
    ]);
  });

  it("runs the events inside a day morning to night", () => {
    const days = groupEventsByDay(
      [
        event("dinner", 19, 20),
        event("breakfast", 19, 8, 30),
        event("swim", 19, 13),
      ],
      null,
    );

    expect(days[0]?.events.map((e) => e.id)).toEqual([
      "breakfast",
      "swim",
      "dinner",
    ]);
  });

  it("keeps a late night with the day it started on", () => {
    const days = groupEventsByDay([event("last orders", 19, 23, 30)], null);
    expect(days[0]?.date).toBe("2026-09-19");
  });

  it("has nothing to say about a day with no events", () => {
    expect(groupEventsByDay([], null)).toEqual([]);
  });
});

describe("daysFrom", () => {
  const days = [
    { date: "2026-09-17", events: [] },
    { date: "2026-09-18", events: [] },
    { date: "2026-09-19", events: [] },
    { date: "2026-09-21", events: [] },
  ];

  it("keeps today and everything after it", () => {
    expect(daysFrom(days, today).map((day) => day.date)).toEqual([
      "2026-09-19",
      "2026-09-21",
    ]);
  });

  it("counts the day you are on as ahead of you, not behind", () => {
    expect(daysFrom(days, today)[0]?.date).toBe(today);
  });
});

describe("dayLabel", () => {
  it("names the days around today, and dates them anyway", () => {
    expect(dayLabel("2026-09-19", today)).toBe("Today · Sat Sep 19");
    expect(dayLabel("2026-09-20", today)).toBe("Tomorrow · Sun Sep 20");
    expect(dayLabel("2026-09-18", today)).toBe("Yesterday · Fri Sep 18");
  });

  it("falls back to the day itself", () => {
    expect(dayLabel("2026-09-26", today)).toBe("Sat Sep 26");
    expect(dayLabel("2026-09-14", today)).toBe("Mon Sep 14");
  });

  it("keeps naming the day across a month boundary", () => {
    expect(dayLabel("2026-10-01", today)).toBe("Thu Oct 1");
  });
});

describe("EVENT_TYPE_LABEL", () => {
  /** The API's event_type, written out here as the contract it is. */
  const API_TYPES: EventType[] = [
    "travel",
    "food_and_drink",
    "arts_and_entertainment",
    "outdoors",
    "nightlife",
    "wellness",
    "shopping",
    "lodging",
    "misc",
  ];

  it("names every type the API can return", () => {
    for (const type of API_TYPES) {
      expect(EVENT_TYPE_LABEL[type]).toBeTruthy();
    }
  });

  it("covers nothing the API cannot return", () => {
    expect(Object.keys(EVENT_TYPE_LABEL).sort()).toEqual([...API_TYPES].sort());
  });
});

describe("liveEvents", () => {
  it("holds back the deleted and keeps the rest", () => {
    const live = liveEvents([
      event("a", 19),
      { ...event("b", 19), deletedAt: "2026-09-19T10:00:00.000Z" },
    ]);
    expect(live.map((e) => e.id)).toEqual(["a"]);
  });

  it("keeps nothing back when nothing is deleted", () => {
    const all = [event("a", 19), event("b", 20)];
    expect(liveEvents(all)).toEqual(all);
  });
});

describe("withEdits", () => {
  const base: ItineraryEvent[] = [
    event("a", 19, 9),
    event("b", 19, 18),
    event("c", 20, 8),
  ];

  it("applies an edit over the row it belongs to", () => {
    const edited = withEdits(base, { b: { name: "Renamed" } });
    expect(edited.find((e) => e.id === "b")?.name).toBe("Renamed");
    // The rows around it are the same objects, untouched.
    expect(edited.find((e) => e.id === "a")).toEqual(base[0]);
  });

  it("keeps every event, edited or not", () => {
    expect(withEdits(base, { b: { name: "Renamed" } })).toHaveLength(3);
  });

  it("no edits is the same list", () => {
    expect(withEdits(base, {})).toEqual(base);
  });

  it("re-sorts after a time change, so an edit cannot unsort a day", () => {
    // c moves from the next morning to before everything on its own day.
    const edited = withEdits(base, {
      c: { startTime: new Date(2026, 8, 19, 7).toISOString() },
    });
    expect(edited.map((e) => e.id)).toEqual(["c", "a", "b"]);
  });

  it("carries a soft delete through as an edit like any other", () => {
    const deleted = withEdits(base, { b: { deletedAt: "2026-09-19T09:00:00.000Z" } });
    expect(deleted.find((e) => e.id === "b")?.deletedAt).toBeTruthy();
    expect(liveEvents(deleted).map((e) => e.id)).toEqual(["a", "c"]);
  });
});

describe("tripIsOver", () => {  it("is over once its last day has gone", () => {
    expect(tripIsOver("2026-09-18", today)).toBe(true);
    expect(tripIsOver("2026-09-19", today)).toBe(false);
    expect(tripIsOver("2026-09-20", today)).toBe(false);
  });
});

describe("eventTimeLabel", () => {
  it("reads a timed event with the zone it is in", () => {
    // An explicit instant, so the device zone the mocks build in cannot
    // move it: 18:30Z is 20:30 on a Mallorca wall, whatever the lab runs.
    // The zone's own name comes from the runtime, so the test reads the
    // same helper the label does rather than pinning ICU's wording.
    const zone = "Europe/Madrid";
    expect(
      eventTimeLabel(
        {
          ...event("dinner", 20, 12),
          startTime: "2026-09-20T18:30:00.000Z",
          endTime: null,
        },
        zone,
      ),
    ).toBe(`8:30 PM · ${getTimezoneAbbr(zone)}`);
  });

  it("reads all day with no zone, because there is no clock", () => {
    expect(
      eventTimeLabel(
        { ...event("festival", 20, 12), allDay: true },
        "Europe/Madrid",
      ),
    ).toBe("All day");
  });
});

describe("all-day events lead their day", () => {
  it("puts all-day above a timed event with an earlier clock", () => {
    // Noon against 7am: if the order followed the stamp alone, the
    // coffee would win. All-day happens all day, so it leads.
    const allDay = { ...event("festival", 20, 12), allDay: true };
    const coffee = event("coffee", 20, 7);

    const day = groupEventsByDay([coffee, allDay]);

    expect(day[0]!.events.map((each) => each.id)).toEqual([
      "festival",
      "coffee",
    ]);
  });

  it("still orders the timed ones among themselves", () => {
    const evening = event("dinner", 20, 19);
    const morning = event("coffee", 20, 7);

    const day = groupEventsByDay([evening, morning]);

    expect(day[0]!.events.map((each) => each.id)).toEqual([
      "coffee",
      "dinner",
    ]);
  });
});
