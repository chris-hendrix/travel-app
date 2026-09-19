import type { Trip } from "@/components/trip/TripCard";
import type { EventType, ItineraryEvent } from "@/lib/itinerary";

/**
 * Mock events, laid onto the days the trip actually runs — a trip that
 * has finished has a finished itinerary, and a trip you are on has a
 * "Today" at the top. Nothing is authored per trip: the pool below is
 * walked from a per-trip offset, the same trick the member roster uses,
 * so every trip has a plausible day without eight hand-written ones.
 *
 * Place names are deliberately destination-agnostic. The photos are
 * stand-ins: the real ones come from Google Places through the API's
 * photo proxy, which owes attribution on the hero.
 */
type Template = {
  name: string;
  type: EventType;
  place: string;
  hour: number;
  minute: number;
  /** Minutes, so a card can say when the thing ends. */
  minutes: number;
};

const POOL: Template[] = [
  {
    name: "Breakfast at the market",
    type: "food_and_drink",
    place: "Mercat Central",
    hour: 8,
    minute: 30,
    minutes: 75,
  },
  {
    name: "Hike the ridge",
    type: "outdoors",
    place: "Ridge trailhead",
    hour: 10,
    minute: 0,
    minutes: 210,
  },
  {
    name: "Swim off the rocks",
    type: "outdoors",
    place: "Cala Petita",
    hour: 13,
    minute: 0,
    minutes: 150,
  },
  {
    name: "Old town wander",
    type: "arts_and_entertainment",
    place: "Old town",
    hour: 15,
    minute: 30,
    minutes: 120,
  },
  {
    name: "Wine tasting",
    type: "food_and_drink",
    place: "Bodega Sole",
    hour: 17,
    minute: 0,
    minutes: 90,
  },
  {
    name: "Sunset swim",
    type: "outdoors",
    place: "South beach",
    hour: 19,
    minute: 0,
    minutes: 60,
  },
  {
    name: "Dinner in town",
    type: "food_and_drink",
    place: "Trattoria Nuova",
    hour: 20,
    minute: 30,
    minutes: 120,
  },
  {
    name: "Drinks after dinner",
    type: "nightlife",
    place: "Bar Centrale",
    hour: 23,
    minute: 0,
    minutes: 90,
  },
  {
    name: "Sauna and a slow morning",
    type: "wellness",
    place: "Bath house",
    hour: 10,
    minute: 30,
    minutes: 120,
  },
  {
    name: "Market run for dinner",
    type: "shopping",
    place: "Corner market",
    hour: 16,
    minute: 30,
    minutes: 45,
  },
  {
    name: "Catch the coastal train",
    type: "travel",
    place: "Station",
    hour: 11,
    minute: 15,
    minutes: 90,
  },
  {
    name: "Gallery afternoon",
    type: "arts_and_entertainment",
    place: "Museo Chico",
    hour: 14,
    minute: 0,
    minutes: 150,
  },
];

/**
 * The offset each trip's events are built in, so a morning event reads
 * as a morning in the trip's own zone. Fixed September offsets, not
 * zone rules: these mocks are days off today, and a winter date would
 * be an hour out. The point is that the zone toggle visibly moves the
 * clock, not that a mock observes DST.
 */
const OFFSETS: Record<string, number> = {
  picos: 120,
  lisbon: 60,
  amalfi: 120,
  chamonix: 120,
  bigsur: -420,
  berlin: 120,
  iceland: 0,
  kyoto: 540,
};

/**
 * The offset each trip's events are built in, exported so an authored
 * event lands on the same clock as the mocks until the API stamps it.
 */
export const zoneOffsetFor = (tripId: string) => OFFSETS[tripId] ?? 0;

/** Deterministic, so a trip always has the same itinerary. */
function offsetFor(tripId: string): number {
  let sum = 0;
  for (const char of tripId) sum += char.charCodeAt(0);
  return sum % POOL.length;
}

/** Stand-in photo until Places serves the real one. */
export function placePhoto(place: string): string {
  const seed = place.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `https://picsum.photos/seed/${seed}/900/450`;
}

/** Two or three things a day, never the same one twice in a day. */
function perDay(tripId: string, dayIndex: number): number {
  return 2 + ((offsetFor(tripId) + dayIndex) % 2);
}

function daysOf(trip: Trip): string[] {
  const days: string[] = [];
  const [year, month, day] = trip.startDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [endYear, endMonth, endDay] = trip.endDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const end = new Date(endYear, endMonth - 1, endDay);

  for (let date = new Date(year, month - 1, day); date <= end; ) {
    days.push(
      `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`,
    );
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  }

  return days;
}

export function eventsFor(trip: Trip): ItineraryEvent[] {
  const events: ItineraryEvent[] = [];
  // A cursor, not a per-day index: multiplying the day by that day's
  // count walks the pool unevenly and puts the same dinner on two
  // consecutive days.
  let cursor = offsetFor(trip.id);

  daysOf(trip).forEach((date, dayIndex) => {
    const [year, month, day] = date.split("-").map(Number) as [
      number,
      number,
      number,
    ];

    for (let index = 0; index < perDay(trip.id, dayIndex); index += 1) {
      const template = POOL[cursor % POOL.length]!;
      cursor += 1;

      // Wall clock in the trip's zone, then the matching instant: a
      // 8:30am breakfast in Mallorca is a 6:30am instant, not a 8:30am
      // one that reads as breakfast in New York.
      const startMs =
        Date.UTC(year, month - 1, day, template.hour, template.minute) -
        zoneOffsetFor(trip.id) * 60_000;
      const end = new Date(startMs + template.minutes * 60_000);

      events.push({
        id: `${trip.id}-${date}-${index}`,
        name: template.name,
        type: template.type,
        startTime: new Date(startMs).toISOString(),
        // A late finish on a night out reads as "until", so the end time
        // is always carried: it is the card's second clock.
        endTime: end.toISOString(),
        // Every mock event has a time; the untimed ones are the ones an
        // organizer typed without one.
        allDay: false,
        place: template.place,
        image: placePhoto(template.place),
      });
    }
  });

  return events;
}
