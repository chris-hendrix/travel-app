import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Trip } from "@/components/trip/TripCard";
import { staysInOrder, type Stay } from "@/lib/stays";
import {
  createStay,
  deleteStay as deleteStayRequest,
  stayKeys,
  updateStay as updateStayRequest,
  type CreateStayRequest,
  type UpdateStayRequest,
} from "@/lib/queries/stays";

type StaysValue = {
  /** Server create now: resolves with the mapped stay. */
  addStay: (tripId: string, stay: Stay) => Promise<Stay>;
  /** Server update now: resolves with the mapped stay. */
  updateStay: (
    tripId: string,
    stayId: string,
    patch: Partial<Stay>,
  ) => Promise<Stay>;
  /** Soft delete, the API's own: the row stays, dated, for Deleted items. */
  deleteStay: (tripId: string, stayId: string) => Promise<void>;
  /** One stay, as the run would show it. */
  stayById: (trip: Trip, stayId: string | undefined) => Stay | undefined;
  /** The server rows for the trip, earliest first. */
  staysForTrip: (trip: Trip) => Stay[];
};

const StaysContext = createContext<StaysValue | null>(null);

/** An edit merges into the slot so a soft delete survives it. */
export function mergeStayEdit(
  existing: Partial<Stay> | undefined,
  patch: Partial<Stay>,
): Partial<Stay> {
  return { ...existing, ...patch };
}

/** A soft delete merges into the slot so an earlier edit survives it. */
export function mergeStayDelete(
  existing: Partial<Stay> | undefined,
  deletedAt: string,
): Partial<Stay> {
  return { ...existing, deletedAt };
}

/**
 * A `Stay` the form built onto the create endpoint's body. `name` is
 * the one required column; `address` rides only when the form gave one
 * (a stay with no address is still a stay, and the schema leaves it
 * optional). Times ride only when set — `null` is the untimed stay,
 * and the create schema's datetime strings cannot express it, so an
 * untimed stay sends no times rather than a null. Links come along
 * from whatever was there: the form never asks for them. Coordinates
 * stay absent until the API's geocoding answers.
 */
function toCreateRequest(stay: Stay): CreateStayRequest {
  return {
    name: stay.name,
    ...(stay.address ? { address: stay.address } : null),
    ...(stay.description ? { description: stay.description } : null),
    ...(stay.checkIn ? { checkIn: stay.checkIn } : null),
    ...(stay.checkOut ? { checkOut: stay.checkOut } : null),
    ...(stay.links.length > 0
      ? {
          links: stay.links.map((link) => ({
            url: link.url,
            ...(link.name !== link.url ? { name: link.name } : null),
          })),
        }
      : null),
  };
}

/**
 * A mobile patch onto the update endpoint's partial body
 * (`updateAccommodationSchema` = `baseAccommodationSchema.partial()`).
 *
 * `updateAccommodationSchema` takes optional datetime strings, never
 * null: a cleared time cannot be expressed (null keeps the server
 * value), only overwritten with a new string. Documented, not worked
 * around — the form always sends full values, never a clear.
 */
function toUpdateRequest(patch: Partial<Stay>): UpdateStayRequest {
  return {
    ...(patch.name !== undefined ? { name: patch.name } : null),
    ...(typeof patch.address === "string" && patch.address
      ? { address: patch.address }
      : null),
    ...(typeof patch.description === "string" && patch.description
      ? { description: patch.description }
      : null),
    ...(typeof patch.checkIn === "string" && patch.checkIn
      ? { checkIn: patch.checkIn }
      : null),
    ...(typeof patch.checkOut === "string" && patch.checkOut
      ? { checkOut: patch.checkOut }
      : null),
    ...(patch.links !== undefined && patch.links.length > 0
      ? {
          links: patch.links.map((link) => ({
            url: link.url,
            ...(link.name !== link.url ? { name: link.name } : null),
          })),
        }
      : null),
  };
}

/**
 * Reads are server state now (`staysOptions`, explicit per section —
 * the itinerary owns the loading copy). Writes go through the API
 * with optimistic cache edits, rollback, and invalidate — the Task 4
 * trips flow shape.
 *
 * The key shape is unchanged, so the three stay screens keep the
 * accessors they already call; only the write bodies are server
 * instead of memory. `stayById`/`staysForTrip` read the list query's
 * cache (the section query populates it); screens that need a stay on
 * a cold load mount `useStaysSection` to warm it.
 */
export function StaysProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationKey: ["stays", "create"],
    mutationFn: ({
      tripId,
      input,
    }: {
      tripId: string;
      input: CreateStayRequest;
      optimistic: Stay;
    }) => createStay(tripId, input),
    onMutate: async ({ tripId, optimistic }) => {
      await queryClient.cancelQueries({ queryKey: stayKeys.list(tripId) });
      const previous = queryClient.getQueryData<Stay[]>(
        stayKeys.list(tripId),
      );
      // The caller's built stay is the optimistic row: its id is the
      // stand-in `onSuccess` swaps the server stay in by.
      queryClient.setQueryData<Stay[]>(
        stayKeys.list(tripId),
        (old) => (old ? [...old, optimistic] : [optimistic]),
      );
      return { previous, tripId, optimisticId: optimistic.id };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          stayKeys.list(context.tripId),
          context.previous,
        );
      } else if (context) {
        queryClient.setQueryData<Stay[]>(
          stayKeys.list(context.tripId),
          (old) => old?.filter((row) => row.id !== context.optimisticId),
        );
      }
    },
    onSuccess: (stay, _input, context) => {
      queryClient.setQueryData<Stay[]>(
        stayKeys.list(context?.tripId ?? ""),
        (old) =>
          old?.map((row) => (row.id === context?.optimisticId ? stay : row)),
      );
    },
    onSettled: (_data, _error, _input, context) => {
      if (context) {
        queryClient.invalidateQueries({
          queryKey: stayKeys.list(context.tripId),
        });
      }
    },
  });

  const updateMutation = useMutation({
    mutationKey: ["stays", "update"],
    mutationFn: ({
      stayId,
      patch,
    }: {
      tripId: string;
      stayId: string;
      patch: Partial<Stay>;
    }) => updateStayRequest(stayId, toUpdateRequest(patch)),
    onMutate: async ({ tripId, stayId, patch }) => {
      await queryClient.cancelQueries({ queryKey: stayKeys.list(tripId) });
      const previous = queryClient.getQueryData<Stay[]>(
        stayKeys.list(tripId),
      );
      if (previous) {
        queryClient.setQueryData<Stay[]>(
          stayKeys.list(tripId),
          previous.map((row) =>
            row.id === stayId ? { ...row, ...patch } : row,
          ),
        );
      }
      return { previous, tripId, stayId };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          stayKeys.list(context.tripId),
          context.previous,
        );
      }
    },
    onSuccess: (stay, _input, context) => {
      // The PUT response carries the full entity, so `toStay` needs
      // no merge: `image` is `placeholderPhoto(stay.id)`,
      // deterministic per id. The swap is by id, not position.
      queryClient.setQueryData<Stay[]>(
        stayKeys.list(context?.tripId ?? ""),
        (old) => old?.map((row) => (row.id === stay.id ? stay : row)),
      );
    },
    onSettled: (_data, _error, _input, context) => {
      if (context) {
        queryClient.invalidateQueries({
          queryKey: stayKeys.list(context.tripId),
        });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationKey: ["stays", "delete"],
    mutationFn: ({ stayId }: { tripId: string; stayId: string }) =>
      deleteStayRequest(stayId),
    onMutate: async ({ tripId, stayId }) => {
      await queryClient.cancelQueries({ queryKey: stayKeys.list(tripId) });
      const previous = queryClient.getQueryData<Stay[]>(
        stayKeys.list(tripId),
      );
      // By edit rather than by removal: `staysForTrip` holds the row
      // back while the request flies, and the snapshot restores it on
      // failure.
      const deletedAt = new Date().toISOString();
      if (previous) {
        queryClient.setQueryData<Stay[]>(
          stayKeys.list(tripId),
          previous.map((row) =>
            row.id === stayId ? { ...row, deletedAt } : row,
          ),
        );
      }
      return { previous, tripId };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          stayKeys.list(context.tripId),
          context.previous,
        );
      }
    },
    onSettled: (_data, _error, _input, context) => {
      // Soft server-side with `includeDeleted` off: the row
      // disappears on this refetch. No undelete UI yet — plan.
      if (context) {
        queryClient.invalidateQueries({
          queryKey: stayKeys.list(context.tripId),
        });
      }
    },
  });

  const staysForTrip = useCallback(
    (trip: Trip): Stay[] =>
      staysInOrder(
        (
          queryClient.getQueryData<Stay[]>(stayKeys.list(trip.id)) ?? []
        ).filter((stay) => !stay.deletedAt),
      ),
    [queryClient],
  );

  const stayById = useCallback(
    (trip: Trip, stayId: string | undefined) => {
      if (!stayId) return undefined;
      return staysForTrip(trip).find((stay) => stay.id === stayId);
    },
    [staysForTrip],
  );

  const value = useMemo(
    () => ({
      addStay: (tripId: string, stay: Stay) =>
        createMutation.mutateAsync({
          tripId,
          input: toCreateRequest(stay),
          optimistic: stay,
        }),
      updateStay: (tripId: string, stayId: string, patch: Partial<Stay>) =>
        updateMutation.mutateAsync({ tripId, stayId, patch }),
      deleteStay: (tripId: string, stayId: string) =>
        deleteMutation.mutateAsync({ tripId, stayId }),
      stayById,
      staysForTrip,
    }),
    [createMutation, updateMutation, deleteMutation, stayById, staysForTrip],
  );

  return (
    <StaysContext.Provider value={value}>{children}</StaysContext.Provider>
  );
}

export function useStays(): StaysValue {
  const value = useContext(StaysContext);
  if (!value) throw new Error("useStays must be used inside StaysProvider");
  return value;
}
