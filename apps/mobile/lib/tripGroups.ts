import type { Trip } from "@/components/trip/TripCard";
import { toIso } from "@/lib/dateRange";

export type TripGroups = { upcoming: Trip[]; past: Trip[] };

/**
 * Upcoming first, soonest first. Past second, newest first. Both are
 * flat lists — the year lives in each card's date line, so the screen
 * needs no year headings.
 *
 * A trip that has started but not finished is upcoming — you are on it.
 */
export function groupTrips(trips: Trip[], today: Date): TripGroups {
  const todayIso = toIso(today);
  const upcoming: Trip[] = [];
  const past: Trip[] = [];

  for (const trip of trips) {
    if (trip.endDate >= todayIso) upcoming.push(trip);
    else past.push(trip);
  }

  upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
  past.sort((a, b) => b.startDate.localeCompare(a.startDate));

  return { upcoming, past };
}
