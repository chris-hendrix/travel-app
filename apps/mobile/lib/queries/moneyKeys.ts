/**
 * The money domain's keys and its one invalidation — a leaf module, so
 * that everything which moves the money can say so.
 *
 * Why this file exists at all: the expense list (`lib/queries/payments.ts`)
 * imports the roster (`lib/queries/members.ts`) for the names it paints,
 * so `members.ts` importing `payments.ts` back would close a cycle. The
 * roster is exactly what a live split scope resolves against, though, so
 * a roster write has to mark the money stale — `D7`'s rule. A module that
 * imports nothing (only the `QueryClient` *type*, which is erased) is the
 * way out: both read modules re-export from here, so every existing call
 * site keeps its name and every key is the same key.
 *
 * No value imports. Keep it that way: the moment this module imports a
 * sibling, the cycle it was created to avoid comes back.
 */

import type { QueryClient } from "@tanstack/react-query";

/** Key factory for the money domain's expenses: `all` / `list(tripId)`. */
export const paymentKeys = {
  all: ["payments"] as const,
  list: (tripId: string) => [...paymentKeys.all, "list", tripId] as const,
};

/** Key factory for the money domain's balances: `all` / `trip` / `me`. */
export const balanceKeys = {
  all: ["balances"] as const,
  trip: (tripId: string) => [...balanceKeys.all, "trip", tripId] as const,
  me: (tripId: string) => [...balanceKeys.all, "me", tripId] as const,
};

/**
 * One invalidation for a change in the money domain: the expense list,
 * the trip's simplified moves and the reader's own position all move
 * together, so every money write settles through this single call rather
 * than invalidating its own key alone.
 *
 * Its callers are the money writes (`lib/queries/payments.ts`) and the
 * people writes (`invalidateTripPeople`, `lib/queries/members.ts`) — the
 * second is why the function lives here rather than beside the ledger.
 */
export async function invalidateTripMoney(
  queryClient: QueryClient,
  tripId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: paymentKeys.list(tripId) }),
    queryClient.invalidateQueries({ queryKey: balanceKeys.trip(tripId) }),
    queryClient.invalidateQueries({ queryKey: balanceKeys.me(tripId) }),
  ]);
}
