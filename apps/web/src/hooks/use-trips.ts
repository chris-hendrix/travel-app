"use client";

import {
  useMutation,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, APIError } from "@/lib/api";
import type { CreateTripInput, UpdateTripInput } from "@journiful/shared/schemas";
import type {
  Trip,
  TripSummary,
  TripDetail,
  GetTripsResponse,
  CreateTripResponse,
  UpdateTripResponse,
} from "@journiful/shared/types";

// Import query keys and options from server-safe module for use in hooks
import {
  tripKeys,
  tripsQueryOptions,
  tripDetailQueryOptions,
  type TripDetailWithMeta,
} from "./trip-queries";
import { weatherKeys } from "./weather-queries";

// Re-export for backward compatibility
export { tripKeys, tripsQueryOptions, tripDetailQueryOptions };
export type { TripDetailWithMeta };

// Re-export types for backward compatibility with existing imports
export type { Trip, TripSummary, TripDetail };

/**
 * API response type for trip cancellation
 */
interface CancelTripResponse {
  success: true;
  message: string;
}

/**
 * Hook for fetching all trips for the current user
 *
 * Features:
 * - Automatic caching: Results are cached with ["trips"] key
 * - Returns TripSummary array with minimal data for trips list display
 * - Error handling: Provides error state for failed requests
 *
 * @returns Query object with data, loading, and error state
 *
 * @example
 * ```tsx
 * const { data: trips, isPending, isError, error, refetch } = useTrips();
 *
 * if (isPending) return <div>Loading...</div>;
 * if (isError) return <div>Error: {error.message}</div>;
 *
 * return trips.map(trip => <TripCard key={trip.id} trip={trip} />);
 * ```
 */
export function useTrips() {
  return useInfiniteQuery(tripsQueryOptions);
}

/**
 * Hook for fetching a single trip's detailed information
 *
 * Features:
 * - Automatic caching: Results are cached with ["trips", tripId] key
 * - Returns detailed trip information including organizers and member count
 * - Error handling: Provides error state for failed requests (404 if trip not found or user has no access)
 *
 * @param tripId - The ID of the trip to fetch
 * @returns Query object with data, loading, and error state
 *
 * @example
 * ```tsx
 * const { data: trip, isPending, isError, error, refetch } = useTripDetail("trip-123");
 *
 * if (isPending) return <div>Loading...</div>;
 * if (isError) return <div>Error: {error.message}</div>;
 *
 * return <TripDetailPage trip={trip} />;
 * ```
 */
export function useTripDetail(tripId: string) {
  return useQuery({ ...tripDetailQueryOptions(tripId), enabled: !!tripId });
}

/**
 * Hook for prefetching a trip's details (e.g., on hover)
 *
 * @param tripId - The ID of the trip to prefetch
 * @returns A callback that triggers the prefetch
 */
export function usePrefetchTrip(tripId: string) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.prefetchQuery(tripDetailQueryOptions(tripId));
  }, [queryClient, tripId]);
}

/**
 * Hook for creating a new trip with optimistic updates
 *
 * Features:
 * - Optimistic updates: Adds trip to cache immediately
 * - Automatic redirect: Navigates to trip detail page on success
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useCreateTrip();
 *
 * const handleSubmit = (data: CreateTripInput) => {
 *   mutate(data);
 * };
 * ```
 */
/**
 * Context type for mutation callbacks
 * Contains previous state for rollback on error
 */
interface CreateTripContext {
  previousTrips: InfiniteData<GetTripsResponse> | undefined;
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation<Trip, APIError, CreateTripInput, CreateTripContext>({
    mutationKey: tripKeys.create(),
    mutationFn: async (data: CreateTripInput) => {
      const response = await apiRequest<CreateTripResponse>("/trips", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return response.trip;
    },

    // Optimistic update: Add trip to cache immediately
    onMutate: async (newTrip) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: tripKeys.all });

      // Snapshot the previous value for rollback
      const previousTrips = queryClient.getQueryData<
        InfiniteData<GetTripsResponse>
      >(tripKeys.all);

      // Optimistically update the cache with a temporary trip
      // Note: We create a temporary ID and placeholder data since we don't have the real ID yet
      const optimisticTrip: Trip = {
        id: "temp-" + Date.now(), // Temporary ID until server responds
        name: newTrip.name,
        destination: newTrip.destination,
        destinationLat: null,
        destinationLon: null,
        startDate: newTrip.startDate || null,
        endDate: newTrip.endDate || null,
        preferredTimezone: newTrip.timezone,
        description: newTrip.description || null,
        coverImageUrl: newTrip.coverImageUrl || null,
        themeId: newTrip.themeId ?? null,
        themeFont: newTrip.themeFont ?? null,
        createdBy: "current-user", // Placeholder - will be replaced by server response
        allowMembersToAddEvents: newTrip.allowMembersToAddEvents ?? true,
        showAllMembers: newTrip.showAllMembers ?? false,
        cancelled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Add optimistic trip to the first page if trips list exists
      if (previousTrips) {
        queryClient.setQueryData<InfiniteData<GetTripsResponse>>(tripKeys.all, {
          ...previousTrips,
          pages: previousTrips.pages.map((page, i) => {
            if (i === 0) {
              return {
                ...page,
                data: [optimisticTrip as unknown as TripSummary, ...page.data],
                meta: { ...page.meta, total: page.meta.total + 1 },
              };
            }
            return page;
          }),
        });
      }

      // Return context with previous data for rollback
      return { previousTrips: previousTrips || undefined };
    },

    // On success: Redirect to trip detail page
    onSuccess: (trip) => {
      // Redirect to the trip detail page
      router.push(`/trips/${trip.id}`);
    },

    // On error: Rollback optimistic update
    onError: (_error, _newTrip, context) => {
      // Rollback to previous trips list if we had one
      if (context?.previousTrips) {
        queryClient.setQueryData(tripKeys.all, context.previousTrips);
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.all });
    },
  });
}

/**
 * Get user-friendly error message from mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getCreateTripErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "CO_ORGANIZER_NOT_FOUND":
        return "One or more co-organizers could not be found. Please check the phone numbers and try again.";
      case "MEMBER_LIMIT_EXCEEDED":
        return "Trip cannot be created: maximum 25 members allowed (including creator and co-organizers).";
      case "VALIDATION_ERROR":
        return "Please check your input and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to create a trip.";
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
interface UpdateTripContext {
  previousTrips: InfiniteData<GetTripsResponse> | undefined;
  previousTrip: Trip | undefined;
}

/**
 * Hook for updating an existing trip with optimistic updates
 *
 * Features:
 * - Optimistic updates: Updates trip in cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 * - Cache invalidation: Updates both trips list and individual trip cache
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useUpdateTrip();
 *
 * const handleSubmit = (tripId: string, data: UpdateTripInput) => {
 *   mutate({ tripId, data });
 * };
 * ```
 */
export function useUpdateTrip() {
  const queryClient = useQueryClient();

  return useMutation<
    Trip,
    APIError,
    { tripId: string; data: UpdateTripInput },
    UpdateTripContext
  >({
    mutationKey: tripKeys.update(),
    mutationFn: async ({ tripId, data }) => {
      const response = await apiRequest<UpdateTripResponse>(
        `/trips/${tripId}`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        },
      );
      return response.trip;
    },

    // Optimistic update: Update trip in cache immediately
    onMutate: async ({ tripId, data }) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: tripKeys.all });
      await queryClient.cancelQueries({ queryKey: tripKeys.detail(tripId) });

      // Snapshot the previous values for rollback
      const previousTrips = queryClient.getQueryData<
        InfiniteData<GetTripsResponse>
      >(tripKeys.all);
      const previousTrip = queryClient.getQueryData<Trip>(
        tripKeys.detail(tripId),
      );

      // Optimistically update the individual trip cache
      if (previousTrip) {
        const optimisticTrip: Trip = {
          ...previousTrip,
          // Only update fields that are provided in the data
          name: data.name ?? previousTrip.name,
          destination: data.destination ?? previousTrip.destination,
          startDate:
            data.startDate !== undefined
              ? (data.startDate ?? null)
              : previousTrip.startDate,
          endDate:
            data.endDate !== undefined
              ? (data.endDate ?? null)
              : previousTrip.endDate,
          preferredTimezone: data.timezone ?? previousTrip.preferredTimezone,
          description:
            data.description !== undefined
              ? (data.description ?? null)
              : previousTrip.description,
          coverImageUrl:
            data.coverImageUrl !== undefined
              ? (data.coverImageUrl ?? null)
              : previousTrip.coverImageUrl,
          allowMembersToAddEvents:
            data.allowMembersToAddEvents ??
            previousTrip.allowMembersToAddEvents,
          showAllMembers: data.showAllMembers ?? previousTrip.showAllMembers,
          updatedAt: new Date(),
        };

        queryClient.setQueryData<Trip>(tripKeys.detail(tripId), optimisticTrip);

        // Also update the trip in the trips list cache (across all pages)
        if (previousTrips) {
          queryClient.setQueryData<InfiniteData<GetTripsResponse>>(
            tripKeys.all,
            {
              ...previousTrips,
              pages: previousTrips.pages.map((page) => ({
                ...page,
                data: page.data.map((trip) =>
                  trip.id === tripId
                    ? (optimisticTrip as unknown as TripSummary)
                    : trip,
                ),
              })),
            },
          );
        }
      }

      // Return context with previous data for rollback
      return { previousTrips, previousTrip };
    },

    // On error: Rollback optimistic update
    onError: (_error, { tripId }, context) => {
      // Rollback to previous state if we had one
      if (context?.previousTrip) {
        queryClient.setQueryData(tripKeys.detail(tripId), context.previousTrip);
      }
      if (context?.previousTrips) {
        queryClient.setQueryData(tripKeys.all, context.previousTrips);
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: (_data, _error, { tripId, data }) => {
      // tripKeys.all (["trips"]) prefix-matches all trip queries including details
      queryClient.invalidateQueries({ queryKey: tripKeys.all });

      // Refetch weather when destination changes (server clears weather cache on destination update)
      if (data.destination !== undefined) {
        queryClient.invalidateQueries({
          queryKey: weatherKeys.forecast(tripId),
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
export function getUpdateTripErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to edit this trip.";
      case "NOT_FOUND":
        return "Trip not found.";
      case "VALIDATION_ERROR":
        return "Please check your input and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to edit a trip.";
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
 * Context type for cancel mutation callbacks
 * Contains previous state for rollback on error
 */
interface CancelTripContext {
  previousTrips: InfiniteData<GetTripsResponse> | undefined;
}

/**
 * Hook for canceling (soft deleting) a trip
 *
 * Features:
 * - Optimistic updates: Removes trip from cache immediately
 * - Automatic redirect: Navigates to trips page on success
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useCancelTrip();
 *
 * const handleDelete = (tripId: string) => {
 *   mutate(tripId);
 * };
 * ```
 */
export function useCancelTrip() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation<void, APIError, string, CancelTripContext>({
    mutationKey: tripKeys.cancel(),
    mutationFn: async (tripId: string) => {
      await apiRequest<CancelTripResponse>(`/trips/${tripId}`, {
        method: "DELETE",
      });
    },

    // Optimistic update: Remove trip from cache immediately
    onMutate: async (tripId) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: tripKeys.all });

      // Snapshot the previous value for rollback
      const previousTrips = queryClient.getQueryData<
        InfiniteData<GetTripsResponse>
      >(tripKeys.all);

      // Optimistically remove the trip from the cache (across all pages)
      if (previousTrips) {
        queryClient.setQueryData<InfiniteData<GetTripsResponse>>(tripKeys.all, {
          ...previousTrips,
          pages: previousTrips.pages.map((page) => ({
            ...page,
            data: page.data.filter((trip) => trip.id !== tripId),
            meta: { ...page.meta, total: Math.max(0, page.meta.total - 1) },
          })),
        });
      }

      // Return context with previous data for rollback
      return { previousTrips };
    },

    // On success: Redirect to trips
    onSuccess: () => {
      // Redirect to the trips page
      router.push("/trips");
    },

    // On error: Rollback optimistic update
    onError: (_error, _tripId, context) => {
      // Rollback to previous trips list if we had one
      if (context?.previousTrips) {
        queryClient.setQueryData(tripKeys.all, context.previousTrips);
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: (_data, _error, tripId) => {
      // Only invalidate the trips list (exact match) and the specific cancelled trip
      queryClient.invalidateQueries({
        queryKey: tripKeys.all,
        exact: true,
      });
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
    },
  });
}

/**
 * Get user-friendly error message from cancel mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getCancelTripErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to delete this trip.";
      case "NOT_FOUND":
        return "Trip not found.";
      case "UNAUTHORIZED":
        return "You must be logged in to delete a trip.";
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
