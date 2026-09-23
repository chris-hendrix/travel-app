import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Trip } from "@/components/trip/TripCard";
import { liveEvents, type ItineraryEvent } from "@/lib/itinerary";
import {
  createEvent,
  deleteEvent as deleteEventRequest,
  eventKeys,
  updateEvent as updateEventRequest,
  type CreateEventRequest,
  type UpdateEventRequest,
} from "@/lib/queries/events";

type EventsValue = {
  /** Server create now: resolves with the mapped event. */
  addEvent: (tripId: string, event: EventDraft) => Promise<ItineraryEvent>;
  /** Server update now: resolves with the mapped event. */
  updateEvent: (
    tripId: string,
    eventId: string,
    patch: Partial<EventDraft>,
  ) => Promise<ItineraryEvent>;
  /** Soft delete, the API's own: the row stays, dated, for Deleted items. */
  deleteEvent: (tripId: string, eventId: string) => Promise<void>;
  /** One event, as the itinerary would show it. */
  eventById: (
    trip: Trip,
    eventId: string | undefined,
  ) => ItineraryEvent | undefined;
  /** The server rows for the trip, earliest first. */
  eventsForTrip: (trip: Trip) => ItineraryEvent[];
};

const EventsContext = createContext<EventsValue | null>(null);

/**
 * What `addEvent`/`updateEvent` accept: the itinerary row plus the
 * picker's coordinates when the place came from a Places lookup.
 * The row type carries no coordinate columns, so they ride as
 * optional extras rather than as fields every caller must set.
 */
export type EventDraft = ItineraryEvent & {
  locationLat?: number | null;
  locationLon?: number | null;
};

/**
 * A tick that moves whenever this domain's cache entries change, so
 * the accessors below re-read the cache instead of the mount-time
 * snapshot. The subscription filters to this domain's key prefix;
 * the snapshot is a counter the subscriber bumps before notifying.
 */
function useEventsTick(): void {
  const queryClient = useQueryClient();
  const tick = useRef(0);
  const subscribe = useCallback(
    (notify: () => void) =>
      queryClient.getQueryCache().subscribe((notification) => {
        const key = notification?.query?.queryKey as unknown;
        if (
          Array.isArray(key) &&
          key.length >= eventKeys.all.length &&
          eventKeys.all.every((segment, index) => key[index] === segment)
        ) {
          tick.current += 1;
          notify();
        }
      }),
    [queryClient],
  );
  const getSnapshot = useCallback(() => tick.current, []);
  const getServerSnapshot = useCallback(() => 0, []);
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

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

/** An edit merges into the slot so a soft delete survives it. */
export function mergeEventEdit(
  existing: Partial<ItineraryEvent> | undefined,
  patch: Partial<ItineraryEvent>,
): Partial<ItineraryEvent> {
  return { ...existing, ...patch };
}

/** A soft delete merges into the slot so an earlier edit survives it. */
export function mergeEventDelete(
  existing: Partial<ItineraryEvent> | undefined,
  deletedAt: string,
): Partial<ItineraryEvent> {
  return { ...existing, deletedAt };
}

/**
 * An `ItineraryEvent` the form built onto the create endpoint's body.
 * The form asks every field the row has, so a create sends all of
 * them; empty place/description ride as absent rather than empty.
 * Coordinates ride along when the place came from a Places lookup —
 * the picker resolves them, and the endpoint persists them.
 */
function toCreateRequest(event: EventDraft): CreateEventRequest {
  return {
    name: event.name,
    ...(event.description ? { description: event.description } : null),
    eventType: event.type,
    ...(event.place ? { location: event.place } : null),
    ...(typeof event.locationLat === "number"
      ? { locationLat: event.locationLat }
      : null),
    ...(typeof event.locationLon === "number"
      ? { locationLon: event.locationLon }
      : null),
    startTime: event.startTime,
    ...(event.endTime ? { endTime: event.endTime } : null),
    allDay: event.allDay,
  };
}

/**
 * A mobile patch onto the update endpoint's partial body
 * (`updateEventSchema` = `baseEventSchema.partial()`). Mobile names
 * (`type`, `place`) translate to API names (`eventType`, `location`).
 *
 * `updateEventSchema` takes optional strings, never null: a cleared
 * description or end time cannot be expressed (null keeps the server
 * value), only overwritten with a new string. Documented, not worked
 * around — the form always sends full values, never a clear.
 */
function toUpdateRequest(
  patch: Partial<EventDraft>,
): UpdateEventRequest {
  return {
    ...(patch.name !== undefined ? { name: patch.name } : null),
    ...(typeof patch.description === "string" && patch.description
      ? { description: patch.description }
      : null),
    ...(patch.type !== undefined ? { eventType: patch.type } : null),
    ...(typeof patch.place === "string" && patch.place
      ? { location: patch.place }
      : null),
    ...(patch.locationLat !== undefined
      ? { locationLat: patch.locationLat }
      : null),
    ...(patch.locationLon !== undefined
      ? { locationLon: patch.locationLon }
      : null),
    ...(patch.startTime !== undefined ? { startTime: patch.startTime } : null),
    ...(patch.endTime !== undefined && patch.endTime !== null
      ? { endTime: patch.endTime }
      : null),
    ...(patch.allDay !== undefined ? { allDay: patch.allDay } : null),
  };
}

/**
 * Reads are server state now (`eventsOptions`, explicit per section —
 * the itinerary owns the loading copy). Writes go through the API
 * with optimistic cache edits, rollback, and invalidate — the Task 4
 * trips flow shape.
 *
 * The key shape is unchanged, so the three event screens keep the
 * accessors they already call; only the write bodies are server
 * instead of memory. `eventById`/`eventsForTrip` read the list
 * query's cache (the section query populates it); screens that need
 * an event on a cold load mount `useEventsSection` to warm it.
 */
export function EventsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Re-reads the cache when this domain's keys change, so a
  // background refetch repaints the accessors below.
  useEventsTick();

  const createMutation = useMutation({
    mutationKey: ["events", "create"],
    mutationFn: ({
      tripId,
      input,
    }: {
      tripId: string;
      input: CreateEventRequest;
      optimistic: ItineraryEvent;
    }) => createEvent(tripId, input),
    onMutate: async ({ tripId, optimistic }) => {
      await queryClient.cancelQueries({ queryKey: eventKeys.list(tripId) });
      const previous = queryClient.getQueryData<ItineraryEvent[]>(
        eventKeys.list(tripId),
      );
      // The caller's built event is the optimistic row: its id is the
      // stand-in `onSuccess` swaps the server event in by.
      queryClient.setQueryData<ItineraryEvent[]>(
        eventKeys.list(tripId),
        (old) => (old ? [...old, optimistic] : [optimistic]),
      );
      return { previous, tripId, optimisticId: optimistic.id };
    },
    onError: (_error, _input, context) => {
      // Delta rollback: only the optimistic row goes away. A whole
      // snapshot here would erase a concurrent write that painted
      // after this mutation's `onMutate` ran.
      if (!context) return;
      queryClient.setQueryData<ItineraryEvent[]>(
        eventKeys.list(context.tripId),
        (old) => old?.filter((row) => row.id !== context.optimisticId),
      );
    },
    onSuccess: (event, _input, context) => {
      queryClient.setQueryData<ItineraryEvent[]>(
        eventKeys.list(context?.tripId ?? ""),
        (old) =>
          old?.map((row) => (row.id === context?.optimisticId ? event : row)),
      );
    },
    onSettled: (_data, _error, _input, context) => {
      if (context) {
        queryClient.invalidateQueries({
          queryKey: eventKeys.list(context.tripId),
        });
      }
    },
  });

  const updateMutation = useMutation({
    mutationKey: ["events", "update"],
    mutationFn: ({
      eventId,
      patch,
    }: {
      tripId: string;
      eventId: string;
      patch: Partial<EventDraft>;
    }) => updateEventRequest(eventId, toUpdateRequest(patch)),
    onMutate: async ({ tripId, eventId, patch }) => {
      await queryClient.cancelQueries({ queryKey: eventKeys.list(tripId) });
      const previous = queryClient.getQueryData<ItineraryEvent[]>(
        eventKeys.list(tripId),
      );
      const previousRow = previous?.find((row) => row.id === eventId);
      if (previous) {
        queryClient.setQueryData<ItineraryEvent[]>(
          eventKeys.list(tripId),
          previous.map((row) =>
            row.id === eventId ? { ...row, ...patch } : row,
          ),
        );
      }
      return { previousRow, ownedKeys: Object.keys(patch), tripId, eventId };
    },
    onError: (_error, _input, context) => {
      // Delta rollback: only this mutation's keys revert on its row.
      // A concurrent edit to another row — or another key of this
      // row — keeps whatever it painted.
      if (!context) return;
      queryClient.setQueryData<ItineraryEvent[]>(
        eventKeys.list(context.tripId),
        (old) =>
          old?.map((row) =>
            row.id === context.eventId
              ? revertOwnedKeys(row, context.previousRow, context.ownedKeys)
              : row,
          ),
      );
    },
    onSuccess: (event, _input, context) => {
      // The PUT response carries the full entity, so `toEvent` needs
      // no merge: `image` is `placeholderPhoto(event.id)`,
      // deterministic per id. The swap is by id, not position.
      queryClient.setQueryData<ItineraryEvent[]>(
        eventKeys.list(context?.tripId ?? ""),
        (old) => old?.map((row) => (row.id === event.id ? event : row)),
      );
    },
    onSettled: (_data, _error, _input, context) => {
      if (context) {
        queryClient.invalidateQueries({
          queryKey: eventKeys.list(context.tripId),
        });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationKey: ["events", "delete"],
    mutationFn: ({ eventId }: { tripId: string; eventId: string }) =>
      deleteEventRequest(eventId),
    onMutate: async ({ tripId, eventId }) => {
      await queryClient.cancelQueries({ queryKey: eventKeys.list(tripId) });
      const previous = queryClient.getQueryData<ItineraryEvent[]>(
        eventKeys.list(tripId),
      );
      const previousRow = previous?.find((row) => row.id === eventId);
      // By edit rather than by removal: `liveEvents` holds the row
      // back while the request flies, and the rollback below restores
      // only its `deletedAt` on failure.
      const deletedAt = new Date().toISOString();
      if (previous) {
        queryClient.setQueryData<ItineraryEvent[]>(
          eventKeys.list(tripId),
          previous.map((row) =>
            row.id === eventId ? { ...row, deletedAt } : row,
          ),
        );
      }
      return { previousRow, tripId, eventId };
    },
    onError: (_error, _input, context) => {
      // Delta rollback: only `deletedAt` reverts on this row, so a
      // concurrent edit keeps whatever it painted.
      if (!context) return;
      queryClient.setQueryData<ItineraryEvent[]>(
        eventKeys.list(context.tripId),
        (old) =>
          old?.map((row) =>
            row.id === context.eventId
              ? revertOwnedKeys(row, context.previousRow, ["deletedAt"])
              : row,
          ),
      );
    },
    onSettled: (_data, _error, _input, context) => {
      // Soft server-side with `includeDeleted` off: the row
      // disappears on this refetch. No undelete UI yet — plan.
      if (context) {
        queryClient.invalidateQueries({
          queryKey: eventKeys.list(context.tripId),
        });
      }
    },
  });

  const eventsForTrip = useCallback(
    (trip: Trip): ItineraryEvent[] =>
      liveEvents(
        queryClient.getQueryData<ItineraryEvent[]>(eventKeys.list(trip.id)) ??
          [],
      ),
    [queryClient],
  );

  const eventById = useCallback(
    (trip: Trip, eventId: string | undefined) => {
      if (!eventId) return undefined;
      return eventsForTrip(trip).find((event) => event.id === eventId);
    },
    [eventsForTrip],
  );

  const value = useMemo(
    () => ({
      addEvent: (tripId: string, event: EventDraft) =>
        createMutation.mutateAsync({
          tripId,
          input: toCreateRequest(event),
          optimistic: event,
        }),
      updateEvent: (
        tripId: string,
        eventId: string,
        patch: Partial<EventDraft>,
      ) => updateMutation.mutateAsync({ tripId, eventId, patch }),
      deleteEvent: (tripId: string, eventId: string) =>
        deleteMutation.mutateAsync({ tripId, eventId }),
      eventById,
      eventsForTrip,
    }),
    [createMutation, updateMutation, deleteMutation, eventById, eventsForTrip],
  );

  return (
    <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
  );
}

export function useEvents(): EventsValue {
  const value = useContext(EventsContext);
  if (!value) throw new Error("useEvents must be used inside EventsProvider");
  return value;
}
