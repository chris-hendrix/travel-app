import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Trip } from "@/components/trip/TripCard";
import type { MockTravel } from "@/mocks/travel";
import { useDomainVersion } from "@/lib/domainVersion";
import {
  createTravel,
  deleteTravel as deleteTravelRequest,
  travelKeys,
  updateTravel as updateTravelRequest,
  type CreateTravelRequest,
  type UpdateTravelRequest,
} from "@/lib/queries/travel";

type TravelValue = {
  /** Server create now: resolves with the mapped record. */
  addTravel: (tripId: string, record: MockTravel) => Promise<MockTravel>;
  /** Server update now: resolves with the mapped record. */
  updateTravel: (
    tripId: string,
    travelId: string,
    patch: Partial<MockTravel>,
  ) => Promise<MockTravel>;
  /** Soft delete, the API's own: the row stays, dated, for Deleted items. */
  deleteTravel: (tripId: string, travelId: string) => Promise<void>;
  /** One record, as the board would show it. */
  travelById: (
    trip: Trip,
    travelId: string | undefined,
  ) => MockTravel | undefined;
  /** The server rows for the trip, unsorted — the board sorts. */
  travelForTrip: (trip: Trip) => MockTravel[];
};

const TravelContext = createContext<TravelValue | null>(null);


/**
 * Only the keys this mutation painted, taken from the pre-paint row:
 * a concurrent write to another row — or another key of this row —
 * survives the rollback because the rollback never sees it.
 */
function revertOwnedKeys<T extends Record<string, unknown>>(
  current: T,
  previousRow: T | undefined,
  ownedKeys: string[],
): T {
  if (!previousRow) return current;
  const restored = { ...current };
  for (const key of ownedKeys) {
    if (key in previousRow) {
      restored[key as keyof T] = previousRow[key] as T[keyof T];
    }
  }
  return restored;
}

/**
 * What a completed write leaves stale, in one place.
 *
 * The trip's own list is the board's and the form's, and the caller's
 * cross-trip wheres are the `Where` field's third source — the where you
 * just filed is the one it should offer next, and it is not part of the
 * list above, so every write has to say both. Named rather than repeated
 * because it was three copies of one key and the copies had already
 * drifted from the reads they were serving.
 */
function invalidateTravelWrite(
  queryClient: QueryClient,
  tripId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: travelKeys.list(tripId) });
  void queryClient.invalidateQueries({ queryKey: travelKeys.locations });
}

/**
 * A write response as the board reads it.
 *
 * The write endpoints answer with `.returning()` — the row and no join —
 * while `memberName` is what the *list* read adds (`toTravel` maps the
 * absent field to `""`). Taking the response row as-is therefore blanks
 * the name on the row you just saved, until the invalidation's refetch
 * lands: the member is drawn without a name for a round trip, and stays
 * that way if that refetch never lands. Every other field is the server's.
 */
function withCachedName(
  record: MockTravel,
  cached: MockTravel | undefined,
): MockTravel {
  if (record.memberName || !cached?.memberName) return record;
  return { ...record, memberName: cached.memberName };
}

/** An edit merges into the slot so a soft delete survives it. */
export function mergeTravelEdit(
  existing: Partial<MockTravel> | undefined,
  patch: Partial<MockTravel>,
): Partial<MockTravel> {
  return { ...existing, ...patch };
}

/** A soft delete merges into the slot so an earlier edit survives it. */
export function mergeTravelDelete(
  existing: Partial<MockTravel> | undefined,
  deletedAt: string,
): Partial<MockTravel> {
  return { ...existing, deletedAt };
}

/**
 * A `MockTravel` the form built onto the create endpoint's body.
 * `travelType` plus its pertinent time is the server's invariant (the
 * create schema refines on it: arrival → `arrivalTime`, departure →
 * `departureTime`), so a record always sends its direction and
 * whichever ends hold values — the counterpart side rides along when
 * the flight lookup filled it in silently. `memberId` rides along so
 * the organizer files for the member the form picked; nulls stay
 * absent rather than sent, since the schema's fields are optional.
 */
function toCreateRequest(record: MockTravel): CreateTravelRequest {
  return {
    travelType: record.travelType,
    memberId: record.memberId,
    ...(record.departureLocation
      ? { departureLocation: record.departureLocation }
      : null),
    ...(record.departureTime ? { departureTime: record.departureTime } : null),
    ...(record.arrivalLocation
      ? { arrivalLocation: record.arrivalLocation }
      : null),
    ...(record.arrivalTime ? { arrivalTime: record.arrivalTime } : null),
    ...(record.details ? { details: record.details } : null),
    ...(record.flightNumber ? { flightNumber: record.flightNumber } : null),
  };
}

/**
 * A mobile patch onto the update endpoint's partial body
 * (`updateMemberTravelSchema` = `baseMemberTravelSchema.partial()`).
 *
 * Membership is fixed at create (`memberId` is create-only), so a patch
 * never carries it — only the leg's ends, the flight, and the details.
 *
 * A key that is present and empty is a *clear*: it goes over the wire as
 * an explicit null, which is what the schema's four nullable fields are
 * for. The distinction that matters is present-but-empty (the member
 * took the value back) against absent (this patch is not about that
 * field), so the test is `!== undefined` rather than truthiness.
 *
 * `travelType` is not among the keys, and that is the schema's rule
 * rather than a preference: a direction is create-only, so a patch that
 * carried one would be asking the server to put a second live row on the
 * pair. The optimistic paint still carries it — the leg's own direction
 * rides on every `MockTravel` — but the wire does not.
 *
 * The two times are never sent as null: they stay non-nullable and
 * `pertinentTimeRefine` depends on that, so a direction is removed with
 * Delete rather than by blanking the time the board files on.
 */
export function toUpdateRequest(patch: Partial<MockTravel>): UpdateTravelRequest {
  return {
    ...(patch.departureLocation !== undefined
      ? { departureLocation: patch.departureLocation || null }
      : null),
    ...(typeof patch.departureTime === "string" && patch.departureTime
      ? { departureTime: patch.departureTime }
      : null),
    ...(patch.arrivalLocation !== undefined
      ? { arrivalLocation: patch.arrivalLocation || null }
      : null),
    ...(typeof patch.arrivalTime === "string" && patch.arrivalTime
      ? { arrivalTime: patch.arrivalTime }
      : null),
    ...(patch.details !== undefined
      ? { details: patch.details || null }
      : null),
    ...(patch.flightNumber !== undefined
      ? { flightNumber: patch.flightNumber || null }
      : null),
  };
}

/**
 * Reads are server state now (`travelOptions`, explicit per section —
 * the board owns the loading copy). Writes go through the API with
 * optimistic cache edits, rollback, and invalidate — the Task 4 trips
 * flow shape.
 *
 * The key shape is unchanged, so the travel board and form keep the
 * accessors they already call; only the write bodies are server
 * instead of memory. `travelById`/`travelForTrip` read the list
 * query's cache (the section query populates it); screens that need
 * travel on a cold load mount `useTravelSection` to warm it.
 */
export function TravelProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Re-reads the cache when this domain's keys change, so a
  // background refetch repaints the accessors below.
  useDomainVersion(travelKeys.all);

  const createMutation = useMutation({
    mutationKey: ["travel", "create"],
    mutationFn: ({
      tripId,
      input,
    }: {
      tripId: string;
      input: CreateTravelRequest;
      optimistic: MockTravel;
    }) => createTravel(tripId, input),
    onMutate: async ({ tripId, optimistic }) => {
      await queryClient.cancelQueries({ queryKey: travelKeys.list(tripId) });
      const previous = queryClient.getQueryData<MockTravel[]>(
        travelKeys.list(tripId),
      );
      // The caller's built record is the optimistic row: its id is the
      // stand-in `onSuccess` swaps the server record in by.
      queryClient.setQueryData<MockTravel[]>(
        travelKeys.list(tripId),
        (old) => (old ? [...old, optimistic] : [optimistic]),
      );
      return { previous, tripId, optimisticId: optimistic.id };
    },
    onError: (_error, _input, context) => {
      // Delta rollback: only the optimistic row goes away. A whole
      // snapshot here would erase a concurrent write that painted
      // after this mutation's `onMutate` ran.
      if (!context) return;
      queryClient.setQueryData<MockTravel[]>(
        travelKeys.list(context.tripId),
        (old) => old?.filter((record) => record.id !== context.optimisticId),
      );
    },
    onSuccess: (record, _input, context) => {
      queryClient.setQueryData<MockTravel[]>(
        travelKeys.list(context?.tripId ?? ""),
        (old) => {
          if (!old) return old;
          // The server may have answered with a row that is already in
          // the cache: a POST on a pair that already holds a live row
          // updates that row and returns it, so swapping by the
          // stand-in's id would leave the stand-in *and* the real row,
          // and the pair would be drawn twice. Drop the stand-in, then
          // let the returned row replace whichever entry already carries
          // its id — or append it when nothing does.
          const withoutStandIn = old.filter(
            (row) => row.id !== context?.optimisticId,
          );
          // The stand-in is the only row that carries the name here: a
          // POST answers with a new id, so the common path appends rather
          // than swaps, and the dropped stand-in is where the picker's
          // answer lives.
          const standIn = old.find(
            (row) => row.id === context?.optimisticId,
          );
          return withoutStandIn.some((row) => row.id === record.id)
            ? withoutStandIn.map((row) =>
                row.id === record.id ? withCachedName(record, row) : row,
              )
            : [...withoutStandIn, withCachedName(record, standIn)];
        },
      );
    },
    onSettled: (_data, _error, _input, context) => {
      if (context) invalidateTravelWrite(queryClient, context.tripId);
    },
  });

  const updateMutation = useMutation({
    mutationKey: ["travel", "update"],
    mutationFn: ({
      travelId,
      patch,
    }: {
      tripId: string;
      travelId: string;
      patch: Partial<MockTravel>;
    }) => updateTravelRequest(travelId, toUpdateRequest(patch)),
    onMutate: async ({ tripId, travelId, patch }) => {
      await queryClient.cancelQueries({ queryKey: travelKeys.list(tripId) });
      const previous = queryClient.getQueryData<MockTravel[]>(
        travelKeys.list(tripId),
      );
      const previousRow = previous?.find((record) => record.id === travelId);
      if (previous) {
        queryClient.setQueryData<MockTravel[]>(
          travelKeys.list(tripId),
          previous.map((record) =>
            record.id === travelId ? { ...record, ...patch } : record,
          ),
        );
      }
      return { previousRow, ownedKeys: Object.keys(patch), tripId, travelId };
    },
    onError: (_error, _input, context) => {
      // Delta rollback: only this mutation's keys revert on its row.
      // A concurrent edit to another row — or another key of this
      // row — keeps whatever it painted.
      if (!context) return;
      queryClient.setQueryData<MockTravel[]>(
        travelKeys.list(context.tripId),
        (old) =>
          old?.map((row) =>
            row.id === context.travelId
              ? revertOwnedKeys(row, context.previousRow, context.ownedKeys)
              : row,
          ),
      );
    },
    onSuccess: (record, _input, context) => {
      // The PUT response carries the entity's own columns, so `toTravel`
      // needs no field merged — only the name, which the write cannot
      // carry. The swap is by id, not position.
      queryClient.setQueryData<MockTravel[]>(
        travelKeys.list(context?.tripId ?? ""),
        (old) =>
          old?.map((row) =>
            row.id === record.id ? withCachedName(record, row) : row,
          ),
      );
    },
    onSettled: (_data, _error, _input, context) => {
      if (context) invalidateTravelWrite(queryClient, context.tripId);
    },
  });

  const deleteMutation = useMutation({
    mutationKey: ["travel", "delete"],
    mutationFn: ({ travelId }: { tripId: string; travelId: string }) =>
      deleteTravelRequest(travelId),
    onMutate: async ({ tripId, travelId }) => {
      await queryClient.cancelQueries({ queryKey: travelKeys.list(tripId) });
      const previous = queryClient.getQueryData<MockTravel[]>(
        travelKeys.list(tripId),
      );
      const previousRow = previous?.find((record) => record.id === travelId);
      // By edit rather than by removal: `travelForTrip` holds the row
      // back while the request flies, and the rollback below restores
      // only its `deletedAt` on failure.
      const deletedAt = new Date().toISOString();
      if (previous) {
        queryClient.setQueryData<MockTravel[]>(
          travelKeys.list(tripId),
          previous.map((record) =>
            record.id === travelId ? { ...record, deletedAt } : record,
          ),
        );
      }
      return { previousRow, tripId, travelId };
    },
    onError: (_error, _input, context) => {
      // Delta rollback: only `deletedAt` reverts on this row, so a
      // concurrent edit keeps whatever it painted.
      if (!context) return;
      queryClient.setQueryData<MockTravel[]>(
        travelKeys.list(context.tripId),
        (old) =>
          old?.map((row) =>
            row.id === context.travelId
              ? revertOwnedKeys(row, context.previousRow, ["deletedAt"])
              : row,
          ),
      );
    },
    onSettled: (_data, _error, _input, context) => {
      // Soft server-side with `includeDeleted` off: the row
      // disappears on this refetch. No undelete UI yet — plan. Its
      // wheres leave the suggestion list with it: that read is live rows
      // only (`getMyLocations`), so a deleted row's where is not a
      // suggestion any more either.
      if (context) invalidateTravelWrite(queryClient, context.tripId);
    },
  });

  const travelForTrip = useCallback(
    (trip: Trip): MockTravel[] =>
      (
        queryClient.getQueryData<MockTravel[]>(travelKeys.list(trip.id)) ?? []
      ).filter((record) => !record.deletedAt),
    [queryClient],
  );

  const travelById = useCallback(
    (trip: Trip, travelId: string | undefined) => {
      if (!travelId) return undefined;
      return travelForTrip(trip).find((record) => record.id === travelId);
    },
    [travelForTrip],
  );

  const value = useMemo(
    () => ({
      addTravel: (tripId: string, record: MockTravel) =>
        createMutation.mutateAsync({
          tripId,
          input: toCreateRequest(record),
          optimistic: record,
        }),
      updateTravel: (
        tripId: string,
        travelId: string,
        patch: Partial<MockTravel>,
      ) => updateMutation.mutateAsync({ tripId, travelId, patch }),
      deleteTravel: (tripId: string, travelId: string) =>
        deleteMutation.mutateAsync({ tripId, travelId }),
      travelById,
      travelForTrip,
    }),
    [createMutation, updateMutation, deleteMutation, travelById, travelForTrip],
  );

  return (
    <TravelContext.Provider value={value}>{children}</TravelContext.Provider>
  );
}

export function useTravel(): TravelValue {
  const value = useContext(TravelContext);
  if (!value) throw new Error("useTravel must be used inside TravelProvider");
  return value;
}
