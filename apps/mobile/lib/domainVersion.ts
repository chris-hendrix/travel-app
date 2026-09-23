import { useCallback, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** Whether a query key sits under a domain's key prefix. */
function isUnder(key: unknown, prefix: readonly unknown[]): boolean {
  return (
    Array.isArray(key) &&
    key.length >= prefix.length &&
    prefix.every((segment, index) => key[index] === segment)
  );
}

/**
 * A number that moves when a domain's cached data changes, for the
 * stores' accessors to read through `useSyncExternalStore`.
 *
 * The stores hold no copy of the data: `eventsForTrip` and its siblings
 * read the cache, so something has to re-render their callers when the
 * data lands. The obvious subscription — notify on every cache event
 * under this domain's keys — is an infinite loop: the cache emits on
 * observer add/remove and on every fetch-state flip, and a re-render of
 * the provider causes more of those events itself, ending in React's
 * "Maximum update depth exceeded" and the error boundary. (Only the web
 * E2E catches that one; the unit tests never render a store.)
 *
 * So the snapshot is not "a cache event happened" but "the data
 * changed": the sum of the domain's `dataUpdatedAt` and
 * `dataUpdateCount`, which moves on a load, a refetch that writes, and
 * an optimistic `setQueryData`, and stays put while a request is merely
 * in flight or an observer comes and goes.
 *
 * `keys` must be a stable reference — the store's own key factory array
 * (`eventKeys.all`), never a fresh literal.
 */
export function useDomainVersion(keys: readonly unknown[]): number {
  const queryClient = useQueryClient();
  const version = useRef<number | null>(null);

  const measure = useCallback(() => {
    let sum = 0;
    for (const query of queryClient
      .getQueryCache()
      .findAll({ queryKey: keys })) {
      sum += query.state.dataUpdatedAt + query.state.dataUpdateCount;
    }
    return sum;
  }, [queryClient, keys]);

  // Read once, on the first render, so subscribing does not itself
  // force a second render: the first snapshot is already the cache's.
  if (version.current === null) version.current = measure();

  const subscribe = useCallback(
    (notify: () => void) =>
      queryClient.getQueryCache().subscribe((notification) => {
        if (!isUnder(notification?.query?.queryKey, keys)) return;
        const next = measure();
        if (next === version.current) return;
        version.current = next;
        notify();
      }),
    [measure, queryClient, keys],
  );

  const getSnapshot = useCallback(() => version.current as number, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
