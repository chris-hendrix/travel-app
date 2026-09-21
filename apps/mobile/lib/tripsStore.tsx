import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { Trip } from "@/components/trip/TripCard";
import { ApiError } from "@/lib/api";
import { placeholderPhoto } from "@/lib/mapping";
import { MockTripsSource, type TripsSource } from "@/lib/sources";
import {
  createTripOptions,
  tripDetailOptions,
  tripKeys,
  tripsListOptions,
  updateTripOptions,
  type CreateTripRequest,
  type UpdateTripRequest,
} from "@/lib/queries/trips";

export type TripsData = {
  trips: Trip[];
};

export type TripsActions = {
  /**
   * Server update now: resolves with the mapped trip. The mutation
   * key stays `updateTrip`, so screens that only write never
   * re-subscribe. `addTrip` (Task 3) untouched.
   */
  create: (input: CreateTripRequest) => Promise<Trip>;
  update: (id: string, patch: UpdateTripRequest) => Promise<Trip>;
};

/**
 * The optimistic stand-in `onMutate` prepends before the server
 * answers. It is never the trip's identity: `onSuccess` swaps in the
 * server trip by this id, and `onSettled` invalidates the list so the
 * next mount reads server truth. Dates map defensively to `""` even
 * though the form always sends user-entered ones.
 */
function optimisticTrip(input: CreateTripRequest): Trip {
  const id = `optimistic-${Date.now()}`;
  return {
    id,
    title: input.name.trim(),
    location: input.destination.trim(),
    image: placeholderPhoto(id),
    going: 1,
    startDate: input.startDate ?? "",
    endDate: input.endDate ?? input.startDate ?? "",
    description: input.description ?? null,
    preferredTimezone: input.timezone,
  };
}

/**
 * The optimistic stand-in an update `onMutate` paints over both
 * caches before the server answers. API field names (`name`,
 * `destination`) translate to the mobile `Trip` fields (`title`,
 * `location`); absent patch fields leave the cached trip untouched.
 * `onSuccess` swaps in the server trip (keeping the cached `going`),
 * and `onSettled` invalidates so the next mount reads server truth.
 */
function applyUpdatePatch(trip: Trip, patch: UpdateTripRequest): Trip {
  return {
    ...trip,
    ...(patch.name !== undefined ? { title: patch.name.trim() } : null),
    ...(patch.destination !== undefined
      ? { location: patch.destination.trim() }
      : null),
    ...(patch.startDate !== undefined ? { startDate: patch.startDate } : null),
    ...(patch.endDate !== undefined ? { endDate: patch.endDate } : null),
    ...(patch.description !== undefined
      ? { description: patch.description }
      : null),
  };
}

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

  // Own type on purpose: the query-backed `TripsActions` below sends
  // `create` to the server (a `CreateTripRequest` in, a promise out),
  // while this pre-query seam keeps the cache-local `(trip: Trip)`
  // shape for the `trips-source` test and the lab. Phase 8 deletes this.
  const actions: { create: (trip: Trip) => void; update: (id: string, patch: Partial<Trip>) => void } = { create, update };

  function getActions(): typeof actions {
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
 * pending state — the screen owns the loading copy). Both writes go
 * through the API with optimistic cache edits, rollback, and
 * invalidate.
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
  const createMutation = useMutation({
    ...createTripOptions(),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: tripKeys.list() });
      const previous = queryClient.getQueryData<Trip[]>(tripKeys.list());
      const optimistic = optimisticTrip(input);
      queryClient.setQueryData<Trip[]>(tripKeys.list(), (old) =>
        old ? [optimistic, ...old] : [optimistic],
      );
      return { previous, optimisticId: optimistic.id };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tripKeys.list(), context.previous);
      }
    },
    onSuccess: (trip, _input, context) => {
      queryClient.setQueryData<Trip[]>(tripKeys.list(), (old) =>
        old?.map((cached) =>
          cached.id === context?.optimisticId ? trip : cached,
        ),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list() });
    },
  });
  const updateMutation = useMutation({
    ...updateTripOptions(),
    onMutate: async ({ id, patch }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: tripKeys.detail(id) }),
        queryClient.cancelQueries({ queryKey: tripKeys.list() }),
      ]);
      const previousDetail = queryClient.getQueryData<Trip>(
        tripKeys.detail(id),
      );
      const previousList = queryClient.getQueryData<Trip[]>(tripKeys.list());
      const apply = (trip: Trip) => applyUpdatePatch(trip, patch);
      if (previousDetail) {
        queryClient.setQueryData<Trip>(tripKeys.detail(id), apply(previousDetail));
      }
      if (previousList) {
        queryClient.setQueryData<Trip[]>(
          tripKeys.list(),
          previousList.map((trip) => (trip.id === id ? apply(trip) : trip)),
        );
      }
      return { previousDetail, previousList, id };
    },
    onError: (_error, _input, context) => {
      if (!context) return;
      if (context.previousDetail) {
        queryClient.setQueryData(
          tripKeys.detail(context.id),
          context.previousDetail,
        );
      }
      if (context.previousList) {
        queryClient.setQueryData(tripKeys.list(), context.previousList);
      }
    },
    onSuccess: (serverTrip, { id }) => {
      // The PUT response carries no `memberCount`, so the mapped
      // `going` is a placeholder: the merge keeps the cached count.
      const merge = (old: Trip | undefined) =>
        old ? { ...serverTrip, going: old.going } : serverTrip;
      queryClient.setQueryData<Trip>(tripKeys.detail(id), (old) => merge(old));
      queryClient.setQueryData<Trip[]>(tripKeys.list(), (old) =>
        old?.map((trip) =>
          trip.id === id ? { ...serverTrip, going: trip.going } : trip,
        ),
      );
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: tripKeys.list() });
    },
  });
  const actions = useMemo<TripsActions>(
    () => ({
      create: (input: CreateTripRequest) => createMutation.mutateAsync(input),
      update: (id: string, patch: UpdateTripRequest) =>
        updateMutation.mutateAsync({ id, patch }),
    }),
    [createMutation, updateMutation],
  );

  return (
    <TripsActionsContext.Provider value={actions}>
      {children}
    </TripsActionsContext.Provider>
  );
}

/** The write half: stable across renders, never re-subscribes. */
export function useTripsActions(): {
  addTrip: (input: CreateTripRequest) => Promise<Trip>;
  updateTrip: (id: string, patch: UpdateTripRequest) => Promise<Trip>;
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

/**
 * The read half for one trip: the detail query, suspended until it
 * resolves. An absent id names nothing, so the query rejects as a
 * 404 without touching the network and the gate answers with the
 * not-found state; a server 404 lands on the same branch via
 * `toErrorCopy`'s pass-through.
 */
export function useTrip(id: string | undefined): {
  trip: Trip | undefined;
} {
  const { data } = useSuspenseQuery({
    ...tripDetailOptions(id ?? ""),
    queryFn: id
      ? tripDetailOptions(id).queryFn
      : () => Promise.reject(new ApiError(404, "Not found")),
  });
  return useMemo(() => ({ trip: data }), [data]);
}

export function useTrips(): TripsData & {
  addTrip: (input: CreateTripRequest) => Promise<Trip>;
  updateTrip: (id: string, patch: UpdateTripRequest) => Promise<Trip>;
} {
  const data = useTripsData();
  const actions = useTripsActions();
  return useMemo(
    () => ({ trips: data.trips, ...actions }),
    [data, actions],
  );
}
