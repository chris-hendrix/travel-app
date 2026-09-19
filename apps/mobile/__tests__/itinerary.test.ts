import { describe, expect, it } from "vitest";
import {
  dayLabel,
  daysFrom,
  EVENT_TYPE_LABEL,
  groupEventsByDay,
  tripIsOver,
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
    place: "Somewhere",
    image: "photo.jpg",
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

describe("tripIsOver", () => {
  it("is over once its last day has gone", () => {
    expect(tripIsOver("2026-09-18", today)).toBe(true);
    expect(tripIsOver("2026-09-19", today)).toBe(false);
    expect(tripIsOver("2026-09-20", today)).toBe(false);
  });
});
