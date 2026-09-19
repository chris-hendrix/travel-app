import type { Trip } from "@/components/trip/TripCard";
import { toIso } from "@/lib/dateRange";

/**
 * Mock trips for design-lab screens. Dates are relative to today so the
 * upcoming / past split always has something in both halves.
 */
function dates(startOffsetDays: number, lengthDays: number) {
  const start = new Date();
  start.setDate(start.getDate() + startOffsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + lengthDays - 1);
  return { startDate: toIso(start), endDate: toIso(end) };
}

export const TRIPS: Trip[] = [
  {
    id: "picos",
    title: "Los Picos Trail",
    location: "Mallorca",
    image: "https://picsum.photos/seed/picos/900/600",
    going: 6,
    description:
      "A hut-to-hut traverse of the Serra de Tramuntana. Long days and early starts, with one rest day on the coast in the middle.",
    ...dates(5, 8),
  },
  {
    id: "lisbon",
    title: "Dana's 30th",
    location: "Lisbon",
    image: "https://picsum.photos/seed/lisbon/900/600",
    going: 11,
    description:
      "Three days for Dana's 30th. Two dinners booked, one day trip to Sintra, and nothing before noon.",
    ...dates(20, 3),
  },
  {
    id: "chamonix",
    title: "Ski week",
    location: "Chamonix",
    image: "https://picsum.photos/seed/chamonix/900/600",
    going: 4,
    description:
      "Seven days in the Chamonix valley. Lift passes are sorted, two of us still need rentals, and the last day stays open for weather.",
    ...dates(150, 7),
  },
  {
    id: "bigsur",
    title: "Coast drive",
    location: "Big Sur",
    image: "https://picsum.photos/seed/bigsur/900/600",
    going: 3,
    description:
      "Driving the coast with no real itinerary. Two nights camping, the rest in motels wherever we end up.",
    ...dates(-60, 7),
  },
  {
    id: "berlin",
    title: "Berlin weekend",
    location: "Berlin",
    image: "https://picsum.photos/seed/berlin/900/600",
    going: 5,
    description:
      "A long weekend in Kreuzberg. One gallery booked, everything else left to chance.",
    ...dates(-200, 3),
  },
  {
    id: "iceland",
    title: "Ring road",
    location: "Iceland",
    image: "https://picsum.photos/seed/iceland/900/600",
    going: 4,
    description:
      "The full ring road, counter-clockwise, with two nights near the glacier lagoon. A 4x4 and two drivers.",
    ...dates(-320, 9),
  },
  {
    id: "kyoto",
    title: "Kyoto in autumn",
    location: "Kyoto",
    image: "https://picsum.photos/seed/kyoto/900/600",
    going: 2,
    description:
      "Ten days in Kyoto for the autumn colours. Temples in the morning, markets in the afternoon.",
    ...dates(-700, 10),
  },
];
