"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiRequest, APIError } from "@/lib/api";
import type {
  CreateEventInput,
  UpdateEventInput,
} from "@journiful/shared/schemas";
import type {
  Event,
  CreateEventResponse,
  UpdateEventResponse,
  RestoreEventResponse,
} from "@journiful/shared/types";

// Import query keys and options from server-safe module for use in hooks
import {
  eventKeys,
  eventsQueryOptions,
  eventsWithDeletedQueryOptions,
  eventDetailQueryOptions,
} from "./event-queries";

// Re-export for backward compatibility
export {
  eventKeys,
  eventsQueryOptions,
  eventsWithDeletedQueryOptions,
  eventDetailQueryOptions,
};

// Re-export types for backward compatibility with existing imports
export type { Event };

/**
 * Hook for fetching all events for a trip
 *
 * Features:
 * - Automatic caching: Results are cached with ["events", "list", tripId] key
 * - Returns Event array for the specified trip
 * - Error handling: Provides error state for failed requests
 *
 * @param tripId - The ID of the trip to fetch events for
 * @returns Query object with data, loading, and error state
 *
 * @example
 * ```tsx
 * const { data: events, isPending, isError, error, refetch } = useEvents("trip-123");
 *
 * if (isPending) return <div>Loading...</div>;
 * if (isError) return <div>Error: {error.message}</div>;
 *
 * return events.map(event => <EventCard key={event.id} event={event} />);
 * ```
 */
export function useEvents(tripId: string, options?: { enabled?: boolean }) {
  return useQuery({
    ...eventsQueryOptions(tripId),
    enabled: (options?.enabled ?? true) && !!tripId,
  });
}

/**
 * Hook for fetching all events for a trip, including soft-deleted ones
 *
 * Used by organizers to view and restore deleted items.
 *
 * @param tripId - The ID of the trip to fetch events for
 * @returns Query object with data, loading, and error state
 */
export function useEventsWithDeleted(tripId: string) {
  return useQuery({
    ...eventsWithDeletedQueryOptions(tripId),
    enabled: !!tripId,
  });
}

/**
 * Hook for fetching a single event's detailed information
 *
 * Features:
 * - Automatic caching: Results are cached with ["events", "detail", eventId] key
 * - Returns detailed event information
 * - Error handling: Provides error state for failed requests (404 if event not found or user has no access)
 *
 * @param eventId - The ID of the event to fetch
 * @returns Query object with data, loading, and error state
 *
 * @example
 * ```tsx
 * const { data: event, isPending, isError, error, refetch } = useEventDetail("event-123");
 *
 * if (isPending) return <div>Loading...</div>;
 * if (isError) return <div>Error: {error.message}</div>;
 *
 * return <EventDetailPage event={event} />;
 * ```
 */
export function useEventDetail(eventId: string) {
  return useQuery({ ...eventDetailQueryOptions(eventId), enabled: !!eventId });
}

/**
 * Hook for prefetching an event's details (e.g., on hover)
 *
 * @param eventId - The ID of the event to prefetch
 * @returns A callback that triggers the prefetch
 */
export function usePrefetchEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.prefetchQuery(eventDetailQueryOptions(eventId));
  }, [queryClient, eventId]);
}

/**
 * Context type for create mutation callbacks
 * Contains previous state for rollback on error
 */
interface CreateEventContext {
  previousEvents: Event[] | undefined;
}

/**
 * Hook for creating a new event with optimistic updates
 *
 * Features:
 * - Optimistic updates: Adds event to cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useCreateEvent();
 *
 * const handleSubmit = (tripId: string, data: CreateEventInput) => {
 *   mutate({ tripId, data });
 * };
 * ```
 */
export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation<
    Event,
    APIError,
    { tripId: string; data: CreateEventInput },
    CreateEventContext
  >({
    mutationKey: eventKeys.create(),
    mutationFn: async ({ tripId, data }) => {
      const response = await apiRequest<CreateEventResponse>(
        `/trips/${tripId}/events`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
      return response.event;
    },

    // Optimistic update: Add event to cache immediately
    onMutate: async ({ tripId, data }) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: eventKeys.lists() });

      // Snapshot the previous value for rollback
      const previousEvents = queryClient.getQueryData<Event[]>(
        eventKeys.list(tripId),
      );

      // Optimistically update the cache with a temporary event
      const optimisticEvent: Event = {
        id: "temp-" + Date.now(),
        tripId,
        createdBy: "current-user",
        name: data.name,
        description: data.description || null,
        eventType: data.eventType,
        location: data.location || null,
        meetupLocation: data.meetupLocation || null,
        meetupTime: data.meetupTime ? new Date(data.meetupTime) : null,
        startTime: new Date(data.startTime),
        endTime: data.endTime ? new Date(data.endTime) : null,
        allDay: data.allDay ?? false,
        isOptional: data.isOptional ?? false,
        links: data.links || null,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Add optimistic event to the cache if events list exists
      if (previousEvents) {
        queryClient.setQueryData<Event[]>(eventKeys.list(tripId), [
          optimisticEvent,
          ...previousEvents,
        ]);
      }

      // Return context with previous data for rollback
      return { previousEvents: previousEvents || undefined };
    },

    // On error: Rollback optimistic update
    onError: (_error, { tripId }, context) => {
      // Rollback to previous events list if we had one
      if (context?.previousEvents) {
        queryClient.setQueryData(
          eventKeys.list(tripId),
          context.previousEvents,
        );
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: (_data, _error, { tripId }) => {
      queryClient.invalidateQueries({ queryKey: eventKeys.list(tripId) });
    },
  });
}

/**
 * Get user-friendly error message from create mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getCreateEventErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to add events to this trip.";
      case "NOT_FOUND":
        return "Trip not found.";
      case "VALIDATION_ERROR":
        return "Please check your input and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to create an event.";
      default:
        return error.message;
    }
  }

  // Network errors or other generic errors
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

/**
 * Context type for update mutation callbacks
 * Contains previous state for rollback on error
 */
interface UpdateEventContext {
  previousEvents: Event[] | undefined;
  previousEvent: Event | undefined;
  tripId: string | undefined;
}

/**
 * Hook for updating an existing event with optimistic updates
 *
 * Features:
 * - Optimistic updates: Updates event in cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 * - Cache invalidation: Updates both events list and individual event cache
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useUpdateEvent();
 *
 * const handleSubmit = (eventId: string, data: UpdateEventInput) => {
 *   mutate({ eventId, data });
 * };
 * ```
 */
export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation<
    Event,
    APIError,
    { eventId: string; data: UpdateEventInput },
    UpdateEventContext
  >({
    mutationKey: eventKeys.update(),
    mutationFn: async ({ eventId, data }) => {
      const response = await apiRequest<UpdateEventResponse>(
        `/events/${eventId}`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        },
      );
      return response.event;
    },

    // Optimistic update: Update event in cache immediately
    onMutate: async ({ eventId, data }) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: eventKeys.lists() });
      await queryClient.cancelQueries({ queryKey: eventKeys.detail(eventId) });

      // Snapshot the previous values for rollback
      const previousEvent = queryClient.getQueryData<Event>(
        eventKeys.detail(eventId),
      );

      // Find the event in any trip's event list
      let previousEvents: Event[] | undefined;
      let tripId: string | undefined;

      if (previousEvent) {
        tripId = previousEvent.tripId;
        previousEvents = queryClient.getQueryData<Event[]>(
          eventKeys.list(tripId),
        );
      }

      // Optimistically update the individual event cache
      if (previousEvent) {
        const optimisticEvent: Event = {
          ...previousEvent,
          name: data.name ?? previousEvent.name,
          description:
            data.description !== undefined
              ? (data.description ?? null)
              : previousEvent.description,
          eventType: data.eventType ?? previousEvent.eventType,
          location:
            data.location !== undefined
              ? (data.location ?? null)
              : previousEvent.location,
          meetupLocation:
            data.meetupLocation !== undefined
              ? (data.meetupLocation ?? null)
              : previousEvent.meetupLocation,
          meetupTime:
            data.meetupTime !== undefined
              ? data.meetupTime
                ? new Date(data.meetupTime)
                : null
              : previousEvent.meetupTime,
          startTime: data.startTime
            ? new Date(data.startTime)
            : previousEvent.startTime,
          endTime:
            data.endTime !== undefined
              ? data.endTime
                ? new Date(data.endTime)
                : null
              : previousEvent.endTime,
          allDay: data.allDay ?? previousEvent.allDay,
          isOptional: data.isOptional ?? previousEvent.isOptional,
          links:
            data.links !== undefined
              ? (data.links ?? null)
              : previousEvent.links,
          updatedAt: new Date(),
        };

        queryClient.setQueryData<Event>(
          eventKeys.detail(eventId),
          optimisticEvent,
        );

        // Also update the event in the events list cache
        if (previousEvents && tripId) {
          queryClient.setQueryData<Event[]>(
            eventKeys.list(tripId),
            previousEvents.map((event) =>
              event.id === eventId ? optimisticEvent : event,
            ),
          );
        }
      }

      // Return context with previous data for rollback
      return { previousEvents, previousEvent, tripId };
    },

    // On error: Rollback optimistic update
    onError: (_error, { eventId }, context) => {
      // Rollback to previous state if we had one
      if (context?.previousEvent) {
        queryClient.setQueryData(
          eventKeys.detail(eventId),
          context.previousEvent,
        );

        if (context.previousEvents) {
          const tripId = context.previousEvent.tripId;
          queryClient.setQueryData(
            eventKeys.list(tripId),
            context.previousEvents,
          );
        }
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: (data, _error, { eventId }, context) => {
      // Invalidate detail query
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) });

      // Invalidate the specific trip's list (and withDeleted variant via prefix match)
      const tripId =
        data?.tripId ??
        queryClient.getQueryData<Event>(eventKeys.detail(eventId))?.tripId ??
        context?.tripId;
      if (tripId) {
        queryClient.invalidateQueries({
          queryKey: eventKeys.list(tripId),
        });
      }
    },
  });
}

/**
 * Get user-friendly error message from update mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getUpdateEventErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to edit this event.";
      case "NOT_FOUND":
        return "Event not found.";
      case "VALIDATION_ERROR":
        return "Please check your input and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to edit an event.";
      default:
        return error.message;
    }
  }

  // Network errors or other generic errors
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

/**
 * Context type for delete mutation callbacks
 * Contains previous state for rollback on error
 */
interface DeleteEventContext {
  previousEvents: Event[] | undefined;
  tripId: string | undefined;
}

/**
 * Hook for deleting (soft deleting) an event
 *
 * Features:
 * - Optimistic updates: Removes event from cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useDeleteEvent();
 *
 * const handleDelete = (eventId: string) => {
 *   mutate(eventId);
 * };
 * ```
 */
export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation<void, APIError, string, DeleteEventContext>({
    mutationKey: eventKeys.delete(),
    mutationFn: async (eventId: string) => {
      await apiRequest(`/events/${eventId}`, {
        method: "DELETE",
      });
    },

    // Optimistic update: Remove event from cache immediately
    onMutate: async (eventId) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: eventKeys.lists() });

      // Get the event to find its tripId
      const event = queryClient.getQueryData<Event>(eventKeys.detail(eventId));
      const tripId = event?.tripId;

      // Snapshot the previous value for rollback
      let previousEvents: Event[] | undefined;
      if (tripId) {
        previousEvents = queryClient.getQueryData<Event[]>(
          eventKeys.list(tripId),
        );

        // Optimistically remove the event from the cache
        if (previousEvents) {
          queryClient.setQueryData<Event[]>(
            eventKeys.list(tripId),
            previousEvents.filter((e) => e.id !== eventId),
          );
        }
      }

      // Return context with previous data for rollback
      return { previousEvents, tripId };
    },

    // On error: Rollback optimistic update
    onError: (_error, _eventId, context) => {
      // Rollback to previous events list if we had one
      if (context?.previousEvents && context.tripId) {
        queryClient.setQueryData(
          eventKeys.list(context.tripId),
          context.previousEvents,
        );
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: (_data, _error, _eventId, context) => {
      // Invalidate the specific trip's list (and withDeleted variant via prefix match)
      if (context?.tripId) {
        queryClient.invalidateQueries({
          queryKey: eventKeys.list(context.tripId),
        });
      }
    },
  });
}

/**
 * Get user-friendly error message from delete mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getDeleteEventErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to delete this event.";
      case "NOT_FOUND":
        return "Event not found.";
      case "UNAUTHORIZED":
        return "You must be logged in to delete an event.";
      default:
        return error.message;
    }
  }

  // Network errors or other generic errors
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

/**
 * Context type for restore mutation callbacks
 * Contains previous state for rollback on error
 */
interface RestoreEventContext {
  previousEvents: Event[] | undefined;
  tripId: string | undefined;
}

/**
 * Hook for restoring a soft-deleted event
 *
 * Features:
 * - Optimistic updates: Adds event back to cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useRestoreEvent();
 *
 * const handleRestore = (eventId: string) => {
 *   mutate(eventId);
 * };
 * ```
 */
export function useRestoreEvent() {
  const queryClient = useQueryClient();

  return useMutation<Event, APIError, string, RestoreEventContext>({
    mutationKey: eventKeys.restore(),
    mutationFn: async (eventId: string) => {
      const response = await apiRequest<RestoreEventResponse>(
        `/events/${eventId}/restore`,
        {
          method: "POST",
        },
      );
      return response.event;
    },

    // Optimistic update: Add event back to cache immediately
    onMutate: async (eventId) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: eventKeys.lists() });

      // Get the event to find its tripId
      const event = queryClient.getQueryData<Event>(eventKeys.detail(eventId));
      const tripId = event?.tripId;

      // Snapshot the previous value for rollback
      let previousEvents: Event[] | undefined;
      if (tripId) {
        previousEvents = queryClient.getQueryData<Event[]>(
          eventKeys.list(tripId),
        );
      }

      // Return context with previous data for rollback
      return { previousEvents, tripId };
    },

    // On success: Update cache with restored event
    onSuccess: (restoredEvent) => {
      const tripId = restoredEvent.tripId;

      // Update the event in the events list cache
      const previousEvents = queryClient.getQueryData<Event[]>(
        eventKeys.list(tripId),
      );
      if (previousEvents) {
        queryClient.setQueryData<Event[]>(eventKeys.list(tripId), [
          restoredEvent,
          ...previousEvents,
        ]);
      }

      // Update the individual event cache
      queryClient.setQueryData<Event>(
        eventKeys.detail(restoredEvent.id),
        restoredEvent,
      );
    },

    // On error: Rollback optimistic update
    onError: (_error, _eventId, context) => {
      // Rollback to previous events list if we had one
      if (context?.previousEvents && context.tripId) {
        queryClient.setQueryData(
          eventKeys.list(context.tripId),
          context.previousEvents,
        );
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: (data, _error, _eventId, context) => {
      // Invalidate the specific trip's list (and withDeleted variant via prefix match)
      const tripId = data?.tripId ?? context?.tripId;
      if (tripId) {
        queryClient.invalidateQueries({
          queryKey: eventKeys.list(tripId),
        });
      }
    },
  });
}

/**
 * Get user-friendly error message from restore mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getRestoreEventErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to restore this event.";
      case "NOT_FOUND":
        return "Event not found.";
      case "UNAUTHORIZED":
        return "You must be logged in to restore an event.";
      default:
        return error.message;
    }
  }

  // Network errors or other generic errors
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}
