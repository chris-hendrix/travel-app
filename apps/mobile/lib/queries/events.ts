import { mutationOptions, queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toEvent } from "@/lib/mapping";
import { isOffline } from "@/lib/queries/errors";
import type { EventType, ItineraryEvent } from "@/lib/itinerary";
import type { Event } from "@journiful/shared/types";

/**
 * Inline mirror of `eventListResponseSchema`
 * (`shared/schemas/event.ts`): `{success, events}`. zod is not a
 * mobile dep, so the shape is declared inline (the
 * trips/auth/invitations precedent). The entity itself is the shared
 * `Event` type.
 */
export type GetEventsResponse = {
  success: true;
  events: Event[];
};

/** Key factory for the events domain: `all` / `list(tripId)`. */
export const eventKeys = {
  all: ["events"] as const,
  list: (tripId: string) => [...eventKeys.all, "list", tripId] as const,
};

/**
 * Events list query: `GET /trips/:tripId/events`
 * (`apps/api/src/routes/event.routes.ts:64`, served by
 * `eventController.listEvents`, response `eventListResponseSchema`).
 *
 * Rows map through `toEvent` (Phase 1 Task 4 — `eventType`→`type`,
 * `location`→`place`, `image`→`placeholderPhoto()` stub; relocation
 * is Phase 6 Task 5's job). No `includeDeleted` param is sent: the
 * endpoint defaults it off and there is no Deleted-items UI yet, so
 * the server returns live rows only. Sorting and `liveEvents`
 * filtering stay with the caller's pure helpers (`lib/itinerary`),
 * not the query — the query preserves server order.
 */
export const eventsOptions = (tripId: string) =>
  queryOptions({
    queryKey: eventKeys.list(tripId),
    queryFn: async (): Promise<ItineraryEvent[]> =>
      (
        await apiFetch<GetEventsResponse>(`/trips/${tripId}/events`)
      ).events.map(toEvent),
  });

/**
 * Explicit section state for a read that fills a section (the plan's
 * tiering rule): `loading` while pending, `offline` when the request
 * never reached the server, `error` for anything else that rejected,
 * `success` with the mapped rows. `retry` refetches. An absent id
 * names nothing, so the query stays disabled and the section reads
 * loading rather than flashing an error.
 *
 * Plain `useQuery`, never Suspense: the trip header is the screen
 * gate, and sections load independently under the rendered header
 * (Mockup §2).
 */
/**
 * Inline mirror of `createEventSchema` (`shared/schemas/event.ts`):
 * `name`, `eventType`, and `startTime` are required; `description`,
 * `location`, `endTime`, `allDay`, `timezone`, and `links` ride along
 * when the form collected them. zod is not a mobile dep, so the shape
 * is declared inline (the trips Task 3 precedent).
 */
export type CreateEventRequest = {
  name: string;
  description?: string;
  eventType: EventType;
  location?: string;
  locationLat?: number | null;
  locationLon?: number | null;
  startTime: string;
  endTime?: string;
  allDay?: boolean;
  timezone?: string;
};

/**
 * Inline mirror of `updateEventSchema`
 * (`shared/schemas/event.ts` = `baseEventSchema.partial()`): every
 * field optional, so an edit sends only what changed. The mobile
 * `ItineraryEvent` names (`type`, `place`) translate to the API names
 * (`eventType`, `location`) at the call site in `lib/eventsStore.tsx`.
 * zod is not a mobile dep, so the shape is declared inline.
 */
export type UpdateEventRequest = {
  name?: string;
  description?: string;
  eventType?: EventType;
  location?: string;
  locationLat?: number | null;
  locationLon?: number | null;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  timezone?: string;
};

/**
 * `POST /trips/:tripId/events` (`apps/api/src/routes/event.routes.ts:109`,
 * body `createEventSchema`, 201 `eventResponseSchema`), mapped through
 * `toEvent`.
 *
 * The response carries the full entity, so `toEvent` needs nothing the
 * response does not have — unlike the trips writes, there is no
 * `memberCount`-style placeholder for the provider to merge. `image`
 * stays `placeholderPhoto(event.id)`, deterministic per id.
 */
export async function createEvent(tripId: string, input: CreateEventRequest) {
  const body = await apiFetch<{ success: true; event: Event }>(
    `/trips/${tripId}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return toEvent(body.event);
}

/** Mutation wrapper for callers that fire `createEvent` via TanStack Query. */
export const createEventOptions = () =>
  mutationOptions({
    mutationKey: ["events", "create"],
    mutationFn: ({ tripId, input }: { tripId: string; input: CreateEventRequest }) =>
      createEvent(tripId, input),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { createEventOptions as createEventMutation };

/**
 * `PUT /events/:id` (`apps/api/src/routes/event.routes.ts:126`, body
 * `updateEventSchema` = partial, so PATCH-like sends are legal; 200
 * `eventResponseSchema`), mapped through `toEvent` — same full-entity
 * response as create, so no placeholder merge.
 */
export async function updateEvent(id: string, patch: UpdateEventRequest) {
  const body = await apiFetch<{ success: true; event: Event }>(
    `/events/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  return toEvent(body.event);
}

/** Mutation wrapper for callers that fire `updateEvent` via TanStack Query. */
export const updateEventOptions = () =>
  mutationOptions({
    mutationKey: ["events", "update"],
    mutationFn: ({ id, patch }: { id: string; patch: UpdateEventRequest }) =>
      updateEvent(id, patch),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { updateEventOptions as updateEventMutation };

/**
 * `DELETE /events/:id` (`apps/api/src/routes/event.routes.ts:143`)
 * — soft server-side, 200 `successResponseSchema` (`{success: true}`
 * in `shared/schemas/trip.ts:153`). Resolves void: after delete the
 * provider invalidates the list query and the row disappears on
 * refetch (`includeDeleted` stays off; no undelete UI yet — plan).
 */
export async function deleteEvent(id: string): Promise<void> {
  await apiFetch<{ success: true }>(`/events/${id}`, { method: "DELETE" });
}

/** Mutation wrapper for callers that fire `deleteEvent` via TanStack Query. */
export const deleteEventOptions = () =>
  mutationOptions({
    mutationKey: ["events", "delete"],
    mutationFn: ({ id }: { id: string }) => deleteEvent(id),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { deleteEventOptions as deleteEventMutation };

export type EventsStatus = "loading" | "error" | "offline" | "success";

export function useEvents(tripId: string | undefined): {
  events: ItineraryEvent[];
  status: EventsStatus;
  retry: () => void;
} {
  const enabled = typeof tripId === "string" && tripId.length > 0;
  const query = useQuery({
    ...eventsOptions(tripId ?? ""),
    enabled,
  });
  const status: EventsStatus = !enabled || query.isPending
    ? "loading"
    : query.isError
      ? isOffline(query.error)
        ? "offline"
        : "error"
      : "success";
  return {
    events: query.data ?? [],
    status,
    retry: () => {
      void query.refetch();
    },
  };
}
