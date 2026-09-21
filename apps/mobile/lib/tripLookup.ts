import type { Trip } from "@/components/trip/TripCard";

/**
 * The trip an id names, or nothing.
 *
 * An unknown id is not another trip: with no trip named there is
 * nothing to show, and the screens answer with the not-found state
 * rather than falling back to the first trip in the pool. An undefined
 * or empty id names nothing either, for the same reason.
 */
export function tripFor(
  trips: Trip[],
  id: string | undefined,
): Trip | undefined {
  if (!id) return undefined;
  return trips.find((candidate) => candidate.id === id);
}
