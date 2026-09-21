import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toEvent } from "@/lib/mapping";
import { isOffline } from "@/lib/queries/errors";
import type { ItineraryEvent } from "@/lib/itinerary";
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
