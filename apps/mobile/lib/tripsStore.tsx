import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Trip } from "@/components/trip/TripCard";
import { MockTripsSource, type TripsSource } from "@/lib/sources";

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
const TripsDataContext = createContext<TripsData | null>(null);

/**
 * Trips data comes from the injected `source`, never a module-level
 * mock import. Defaults to the mock; the wiring passes an API source.
 */
export function TripsProvider({
  children,
  source = MockTripsSource,
}: {
  children: ReactNode;
  source?: TripsSource;
}) {
  const [store] = useState(() => createTripsStore(source));
  const data = useSyncExternalStore(
    store.subscribe,
    store.getData,
    store.getData,
  );

  return (
    <TripsActionsContext.Provider value={store.getActions()}>
      <TripsDataContext.Provider value={data}>
        {children}
      </TripsDataContext.Provider>
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

/** The read half: re-renders only when the trips change. */
export function useTripsData(): TripsData {
  const data = useContext(TripsDataContext);
  if (!data) throw new Error("useTripsData must be used inside TripsProvider");
  return data;
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
