import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type {
  GetEventsResponse,
  GetEventResponse,
} from "@journiful/shared/types";

/**
 * Query key factory for event-related queries
 */
export const eventKeys = {
  all: ["events"] as const,
  lists: () => ["events", "list"] as const,
  list: (tripId: string) => ["events", "list", tripId] as const,
  details: () => ["events", "detail"] as const,
  detail: (id: string) => ["events", "detail", id] as const,
  create: () => ["events", "create"] as const,
  update: () => ["events", "update"] as const,
  delete: () => ["events", "delete"] as const,
  restore: () => ["events", "restore"] as const,
};

/**
 * Query options for fetching all events for a trip
 */
export const eventsQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: eventKeys.list(tripId),
    staleTime: 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetEventsResponse>(
        `/trips/${tripId}/events`,
        { signal },
      );
      return response.events;
    },
  });

/**
 * Query options for fetching all events for a trip, including soft-deleted ones
 */
export const eventsWithDeletedQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: [...eventKeys.list(tripId), "withDeleted"] as const,
    staleTime: 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetEventsResponse>(
        `/trips/${tripId}/events?includeDeleted=true`,
        { signal },
      );
      return response.events;
    },
  });

/**
 * Query options factory for fetching a single event's details
 */
export const eventDetailQueryOptions = (eventId: string) =>
  queryOptions({
    queryKey: eventKeys.detail(eventId),
    staleTime: 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetEventResponse>(
        `/events/${eventId}`,
        {
          signal,
        },
      );
      return response.event;
    },
  });
