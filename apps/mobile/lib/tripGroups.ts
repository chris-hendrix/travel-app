import type { Trip } from "@/components/trip/TripCard";
import { toIso } from "@/lib/dateRange";

export type YearGroup = { year: number; trips: Trip[] };
export type TripGroups = { upcoming: YearGroup[]; past: YearGroup[] };

/**
 * Upcoming first, soonest first. Past second, newest first, split by
 * year so a long history stays navigable.
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

  return { upcoming: byYear(upcoming), past: byYear(past) };
}

/** Groups in the order given, so callers control ascending/descending. */
function byYear(trips: Trip[]): YearGroup[] {
  const groups = new Map<number, Trip[]>();
  for (const trip of trips) {
    const year = Number(trip.startDate.slice(0, 4));
    const bucket = groups.get(year);
    if (bucket) bucket.push(trip);
    else groups.set(year, [trip]);
  }
  return [...groups.entries()].map(([year, yearTrips]) => ({
    year,
    trips: yearTrips,
  }));
}
