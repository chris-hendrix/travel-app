import type { Trip } from "@/components/trip/TripCard";
import { toIso } from "@/lib/dateRange";

export type TripGroups = { current: Trip[]; upcoming: Trip[]; past: Trip[] };

/**
 * Underway first, then upcoming soonest first, then past newest first. All
 * three are flat lists — the year lives in each card's date line, so the
 * screen needs no year headings.
 *
 * **A trip that has started but not finished is its own group.** It used to
 * be the head of `upcoming`, on the argument that you are on it, and it did
 * sort first there — its start date is the earliest. But the screen's job is
 * to answer what is happening, and "the trip you are on right now" and "a
 * trip in six months" are not the same answer. `tripCountdown` has said
 * `underway` for the first of them since it was written; this makes the list
 * agree with the card.
 */
export function groupTrips(trips: Trip[], today: Date): TripGroups {
  const todayIso = toIso(today);
  const current: Trip[] = [];
  const upcoming: Trip[] = [];
  const past: Trip[] = [];

  for (const trip of trips) {
    if (trip.endDate < todayIso) past.push(trip);
    else if (trip.startDate <= todayIso) current.push(trip);
    else upcoming.push(trip);
  }

  current.sort((a, b) => a.startDate.localeCompare(b.startDate));
  upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
  past.sort((a, b) => b.startDate.localeCompare(a.startDate));

  return { current, upcoming, past };
}
