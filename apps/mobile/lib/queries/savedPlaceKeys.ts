/**
 * The saved-places domain's keys and its one invalidation — a leaf
 * module, so that everything which moves a saved place can say so.
 *
 * Why this file exists at all: the reads (`lib/queries/savedPlaces.ts`)
 * paint creator names off the roster (`lib/queries/members.ts`), so
 * `members.ts` importing `savedPlaces.ts` back would close a cycle.
 * A module that imports nothing (only the `QueryClient` *type*, which
 * is erased) is the way out: every key lives here, and a future roster
 * write that must mark the places stale can do it without importing
 * the reads.
 *
 * No value imports. Keep it that way: the moment this module imports a
 * sibling, the cycle it was created to avoid comes back.
 */

import type { QueryClient } from "@tanstack/react-query";

/** Key factory for the saved-places domain: `all` / `list(tripId)`. */
export const savedPlaceKeys = {
  all: ["savedPlaces"] as const,
  list: (tripId: string) => [...savedPlaceKeys.all, "list", tripId] as const,
};

/**
 * One invalidation for a change in the saved-places domain: the trip's
 * list goes stale. There is no single-row read, so there is no detail
 * key — every write settles through this single call rather than
 * invalidating its own key alone.
 */
export async function invalidateTripPlaces(
  queryClient: QueryClient,
  tripId: string,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: savedPlaceKeys.list(tripId) });
}
