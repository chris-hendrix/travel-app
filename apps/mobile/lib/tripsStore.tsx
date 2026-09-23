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
import {
  createTripOptions,
  removeCoverOptions,
  tripDetailOptions,
  tripKeys,
  tripsListOptions,
  updateTripOptions,
  uploadCoverOptions,
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
  /**
   * Cover writes ride the cover endpoints (Task 5), never the PUT
   * patch. Both resolve with the mapped trip.
   */
  uploadCover: (id: string, uri: string) => Promise<Trip>;
  removeCover: (id: string) => Promise<Trip>;
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
 * `ownedTripKeys` is its inverse for rollback: the mobile fields one
 * patch owns, so a failure reverts only those and never a concurrent
 * write to another field or another trip.
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

function ownedTripKeys(patch: UpdateTripRequest): Array<keyof Trip> {
  const keys: Array<keyof Trip> = [];
  if (patch.name !== undefined) keys.push("title");
  if (patch.destination !== undefined) keys.push("location");
  if (patch.startDate !== undefined) keys.push("startDate");
  if (patch.endDate !== undefined) keys.push("endDate");
  if (patch.description !== undefined) keys.push("description");
  return keys;
}

/**
 * Only the keys this mutation painted, taken from the pre-paint trip:
 * a concurrent write to another trip — or another key of this trip —
 * survives the rollback because the rollback never sees it.
 */
function revertOwnedTripKeys(
  current: Trip,
  previousRow: Trip | undefined,
  ownedKeys: Array<keyof Trip>,
): Trip {
  if (!previousRow) return current;
  const restored: Record<string, unknown> = { ...current };
  const prev: Record<string, unknown> = { ...previousRow };
  for (const key of ownedKeys) {
    restored[key] = prev[key];
  }
  return restored as Trip;
}

const TripsActionsContext = createContext<TripsActions | null>(null);

/**
 * Reads are server state now (`tripsListOptions`, Suspense for the
 * pending state — the screen owns the loading copy). Both writes go
 * through the API with optimistic cache edits, rollback, and
 * invalidate.
 *
 * Phase 8: the injected-source seam is gone — the seam module and its
 * store factory are deleted. Data comes from the query cache;
 * the lab renders from the mocks directory directly, never through this provider.
 */
export function TripsProvider({ children }: { children: ReactNode }) {
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
      // Delta rollback: only the optimistic row goes away. A whole
      // snapshot here would erase a concurrent create that painted
      // after this mutation's `onMutate` ran.
      if (!context) return;
      queryClient.setQueryData<Trip[]>(tripKeys.list(), (old) =>
        old?.filter((cached) => cached.id !== context.optimisticId),
      );
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
      return {
        previousDetail,
        previousListRow: previousList?.find((trip) => trip.id === id),
        ownedKeys: ownedTripKeys(patch),
        id,
      };
    },
    onError: (_error, _input, context) => {
      // Delta rollback: only this mutation's keys revert on its trip,
      // in both caches. A concurrent write elsewhere keeps its paint.
      if (!context) return;
      queryClient.setQueryData<Trip>(tripKeys.detail(context.id), (old) =>
        old
          ? revertOwnedTripKeys(old, context.previousDetail, context.ownedKeys)
          : old,
      );
      queryClient.setQueryData<Trip[]>(tripKeys.list(), (old) =>
        old?.map((trip) =>
          trip.id === context.id
            ? revertOwnedTripKeys(trip, context.previousListRow, context.ownedKeys)
            : trip,
        ),
      );
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
  /**
   * Cover-merge shared by both cover mutations: the cover response
   * carries no `memberCount`, so the merge keeps the cached `going`
   * (the Task 4 update-mutation convention).
   */
  const mergeCover = (serverTrip: Trip, id: string) => {
    queryClient.setQueryData<Trip>(tripKeys.detail(id), (old) =>
      old ? { ...serverTrip, going: old.going } : serverTrip,
    );
    queryClient.setQueryData<Trip[]>(tripKeys.list(), (old) =>
      old?.map((trip) =>
        trip.id === id ? { ...serverTrip, going: trip.going } : trip,
      ),
    );
  };
  /**
   * Optimistic cover paint shared by both mutations: cancel both
   * caches, snapshot for rollback, paint `image`, return the context
   * `onError` restores. Same flow shape as the update mutation.
   */
  const paintCover = async (id: string, image: string) => {
    await Promise.all([
      queryClient.cancelQueries({ queryKey: tripKeys.detail(id) }),
      queryClient.cancelQueries({ queryKey: tripKeys.list() }),
    ]);
    const previousDetail = queryClient.getQueryData<Trip>(tripKeys.detail(id));
    const previousList = queryClient.getQueryData<Trip[]>(tripKeys.list());
    if (previousDetail) {
      queryClient.setQueryData<Trip>(tripKeys.detail(id), {
        ...previousDetail,
        image,
      });
    }
    if (previousList) {
      queryClient.setQueryData<Trip[]>(
        tripKeys.list(),
        previousList.map((trip) =>
          trip.id === id ? { ...trip, image } : trip,
        ),
      );
    }
    return {
      previousDetail,
      previousListRow: previousList?.find((trip) => trip.id === id),
      id,
    };
  };
  const restoreCover = (context: {
    previousDetail: Trip | undefined;
    previousListRow: Trip | undefined;
    id: string;
  }) => {
    // The paint only ever touched `image`, so the rollback only ever
    // restores `image`: a concurrent field edit keeps its paint.
    queryClient.setQueryData<Trip>(tripKeys.detail(context.id), (old) =>
      old && context.previousDetail
        ? { ...old, image: context.previousDetail.image }
        : (old ?? context.previousDetail),
    );
    queryClient.setQueryData<Trip[]>(tripKeys.list(), (old) =>
      old?.map((trip) =>
        trip.id === context.id && context.previousListRow
          ? { ...trip, image: context.previousListRow.image }
          : trip,
      ),
    );
  };
  const invalidateCover = (id: string) => {
    queryClient.invalidateQueries({ queryKey: tripKeys.detail(id) });
    queryClient.invalidateQueries({ queryKey: tripKeys.list() });
  };
  // The optimistic image is the picker's local URI (the screen
  // renders it while the upload flies); `onSuccess` swaps in the
  // server URL via the shared merge.
  const uploadCoverMutation = useMutation({
    ...uploadCoverOptions(),
    onMutate: ({ id, uri }) => paintCover(id, uri),
    onError: (_error, _input, context) => {
      if (context) restoreCover(context);
    },
    onSuccess: (serverTrip, { id }) => mergeCover(serverTrip, id),
    onSettled: (_data, _error, { id }) => invalidateCover(id),
  });
  // The optimistic image is the placeholder (a nulled cover maps
  // through `toTrip` to `placeholderPhoto` on success anyway).
  const removeCoverMutation = useMutation({
    ...removeCoverOptions(),
    onMutate: ({ id }) => paintCover(id, placeholderPhoto(id)),
    onError: (_error, _input, context) => {
      if (context) restoreCover(context);
    },
    onSuccess: (serverTrip, { id }) => mergeCover(serverTrip, id),
    onSettled: (_data, _error, { id }) => invalidateCover(id),
  });
  const actions = useMemo<TripsActions>(
    () => ({
      create: (input: CreateTripRequest) => createMutation.mutateAsync(input),
      update: (id: string, patch: UpdateTripRequest) =>
        updateMutation.mutateAsync({ id, patch }),
      uploadCover: (id: string, uri: string) =>
        uploadCoverMutation.mutateAsync({ id, uri }),
      removeCover: (id: string) => removeCoverMutation.mutateAsync({ id }),
    }),
    [createMutation, updateMutation, uploadCoverMutation, removeCoverMutation],
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
  uploadCover: (id: string, uri: string) => Promise<Trip>;
  removeCover: (id: string) => Promise<Trip>;
} {
  const actions = useContext(TripsActionsContext);
  if (!actions)
    throw new Error("useTripsActions must be used inside TripsProvider");
  return useMemo(
    () => ({
      addTrip: actions.create,
      updateTrip: actions.update,
      uploadCover: actions.uploadCover,
      removeCover: actions.removeCover,
    }),
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
  uploadCover: (id: string, uri: string) => Promise<Trip>;
  removeCover: (id: string) => Promise<Trip>;
} {
  const data = useTripsData();
  const actions = useTripsActions();
  return useMemo(
    () => ({ trips: data.trips, ...actions }),
    [data, actions],
  );
}
