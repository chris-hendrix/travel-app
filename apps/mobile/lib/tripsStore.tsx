import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { Trip } from "@/components/trip/TripCard";
import { MockTripsSource, type TripsSource } from "@/lib/sources";
import { tripKeys, tripsListOptions } from "@/lib/queries/trips";

export type TripsData = {
  trips: Trip[];
};

export type TripsActions = {
  create: (trip: Trip) => void;
  update: (id: string, patch: Partial<Trip>) => void;
};

/**
 * The store core the provider subscribes to. `getData()` returns a
 * CACHED snapshot — the same object until a real write — because
 * `useSyncExternalStore` warns when the snapshot changes identity
 * without a store update. `getActions()` is created once and never
 * changes identity, so a screen that only writes never re-subscribes.
 *
 * Pre-query seam, kept for the `trips-source` unit test and the lab:
 * the app's reads now come from `tripsListOptions` below, not from a
 * source. Do not extend — Phase 8 deletes this once every store is
 * query-backed.
 */
export function createTripsStore(source: TripsSource) {
  const listeners = new Set<() => void>();
  let cached: TripsData | null = null;

  function getData(): TripsData {
    if (!cached) cached = { trips: source.list() };
    return cached;
  }

  function emit() {
    cached = null;
    listeners.forEach((listener) => listener());
  }

  function create(trip: Trip) {
    source.create(trip);
    emit();
  }

  function update(id: string, patch: Partial<Trip>) {
    source.update(id, patch);
    emit();
  }

  const actions: TripsActions = { create, update };

  function getActions(): TripsActions {
    return actions;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { subscribe, getData, getActions, create, update };
}

export type TripsStore = ReturnType<typeof createTripsStore>;

const TripsActionsContext = createContext<TripsActions | null>(null);

/**
 * Reads are server state now (`tripsListOptions`, Suspense for the
 * pending state — the screen owns the loading copy). Writes stay
 * cache-local until the create/edit tasks land their mutations: they
 * prepend/patch the list query's data so the lab and the new/edit
 * screens keep working with no screen changes.
 *
 * The `source` prop is accepted but no longer read: it exists only so
 * existing providers keep mounting. Do not pass one.
 */
export function TripsProvider({
  children,
  source: _source = MockTripsSource,
}: {
  children: ReactNode;
  source?: TripsSource;
}) {
  void _source;
  const queryClient = useQueryClient();
  const [actions] = useState<TripsActions>(() => ({
    create: (trip: Trip) => {
      queryClient.setQueryData<Trip[]>(tripKeys.list(), (old) =>
        old ? [trip, ...old] : [trip],
      );
    },
    update: (id: string, patch: Partial<Trip>) => {
      queryClient.setQueryData<Trip[]>(tripKeys.list(), (old) =>
        old?.map((trip) =>
          trip.id === id ? { ...trip, ...patch } : trip,
        ),
      );
    },
  }));

  return (
    <TripsActionsContext.Provider value={actions}>
      {children}
    </TripsActionsContext.Provider>
  );
}

/** The write half: stable across renders, never re-subscribes. */
export function useTripsActions(): {
  addTrip: (trip: Trip) => void;
  updateTrip: (id: string, patch: Partial<Trip>) => void;
} {
  const actions = useContext(TripsActionsContext);
  if (!actions)
    throw new Error("useTripsActions must be used inside TripsProvider");
  return useMemo(
    () => ({ addTrip: actions.create, updateTrip: actions.update }),
    [actions],
  );
}

/** The read half: the list query, suspended until it resolves. */
export function useTripsData(): TripsData {
  const { data } = useSuspenseQuery(tripsListOptions());
  return useMemo(() => ({ trips: data }), [data]);
}

export function useTrips(): TripsData & {
  addTrip: (trip: Trip) => void;
  updateTrip: (id: string, patch: Partial<Trip>) => void;
} {
  const data = useTripsData();
  const actions = useTripsActions();
  return useMemo(
    () => ({ trips: data.trips, ...actions }),
    [data, actions],
  );
}
