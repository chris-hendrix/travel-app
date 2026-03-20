"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiRequest, APIError } from "@/lib/api";
import type {
  CreateAccommodationInput,
  UpdateAccommodationInput,
} from "@journiful/shared/schemas";
import type {
  Accommodation,
  CreateAccommodationResponse,
  UpdateAccommodationResponse,
  RestoreAccommodationResponse,
} from "@journiful/shared/types";

// Import query keys and options from server-safe module for use in hooks
import {
  accommodationKeys,
  accommodationsQueryOptions,
  accommodationsWithDeletedQueryOptions,
  accommodationDetailQueryOptions,
} from "./accommodation-queries";

// Re-export for backward compatibility
export {
  accommodationKeys,
  accommodationsQueryOptions,
  accommodationsWithDeletedQueryOptions,
  accommodationDetailQueryOptions,
};

// Re-export types for backward compatibility with existing imports
export type { Accommodation };

/**
 * Hook for fetching all accommodations for a trip
 *
 * Features:
 * - Automatic caching: Results are cached with ["accommodations", "list", tripId] key
 * - Returns Accommodation array for the specified trip
 * - Error handling: Provides error state for failed requests
 *
 * @param tripId - The ID of the trip to fetch accommodations for
 * @returns Query object with data, loading, and error state
 *
 * @example
 * ```tsx
 * const { data: accommodations, isPending, isError, error, refetch } = useAccommodations("trip-123");
 *
 * if (isPending) return <div>Loading...</div>;
 * if (isError) return <div>Error: {error.message}</div>;
 *
 * return accommodations.map(accommodation => <AccommodationCard key={accommodation.id} accommodation={accommodation} />);
 * ```
 */
export function useAccommodations(tripId: string) {
  return useQuery({ ...accommodationsQueryOptions(tripId), enabled: !!tripId });
}

/**
 * Hook for fetching all accommodations for a trip, including soft-deleted ones
 *
 * Used by organizers to view and restore deleted items.
 *
 * @param tripId - The ID of the trip to fetch accommodations for
 * @returns Query object with data, loading, and error state
 */
export function useAccommodationsWithDeleted(tripId: string) {
  return useQuery({
    ...accommodationsWithDeletedQueryOptions(tripId),
    enabled: !!tripId,
  });
}

/**
 * Hook for fetching a single accommodation's detailed information
 *
 * Features:
 * - Automatic caching: Results are cached with ["accommodations", "detail", accommodationId] key
 * - Returns detailed accommodation information
 * - Error handling: Provides error state for failed requests (404 if accommodation not found or user has no access)
 *
 * @param accommodationId - The ID of the accommodation to fetch
 * @returns Query object with data, loading, and error state
 *
 * @example
 * ```tsx
 * const { data: accommodation, isPending, isError, error, refetch } = useAccommodationDetail("accommodation-123");
 *
 * if (isPending) return <div>Loading...</div>;
 * if (isError) return <div>Error: {error.message}</div>;
 *
 * return <AccommodationDetailPage accommodation={accommodation} />;
 * ```
 */
export function useAccommodationDetail(accommodationId: string) {
  return useQuery({
    ...accommodationDetailQueryOptions(accommodationId),
    enabled: !!accommodationId,
  });
}

/**
 * Hook for prefetching an accommodation's details (e.g., on hover)
 *
 * @param accommodationId - The ID of the accommodation to prefetch
 * @returns A callback that triggers the prefetch
 */
export function usePrefetchAccommodation(accommodationId: string) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.prefetchQuery(
      accommodationDetailQueryOptions(accommodationId),
    );
  }, [queryClient, accommodationId]);
}

/**
 * Context type for create mutation callbacks
 * Contains previous state for rollback on error
 */
interface CreateAccommodationContext {
  previousAccommodations: Accommodation[] | undefined;
}

/**
 * Hook for creating a new accommodation with optimistic updates
 *
 * Features:
 * - Optimistic updates: Adds accommodation to cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useCreateAccommodation();
 *
 * const handleSubmit = (tripId: string, data: CreateAccommodationInput) => {
 *   mutate({ tripId, data });
 * };
 * ```
 */
export function useCreateAccommodation() {
  const queryClient = useQueryClient();

  return useMutation<
    Accommodation,
    APIError,
    { tripId: string; data: CreateAccommodationInput },
    CreateAccommodationContext
  >({
    mutationKey: accommodationKeys.create(),
    mutationFn: async ({ tripId, data }) => {
      const response = await apiRequest<CreateAccommodationResponse>(
        `/trips/${tripId}/accommodations`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
      return response.accommodation;
    },

    // Optimistic update: Add accommodation to cache immediately
    onMutate: async ({ tripId, data }) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: accommodationKeys.lists() });

      // Snapshot the previous value for rollback
      const previousAccommodations = queryClient.getQueryData<Accommodation[]>(
        accommodationKeys.list(tripId),
      );

      // Optimistically update the cache with a temporary accommodation
      const optimisticAccommodation: Accommodation = {
        id: "temp-" + Date.now(),
        tripId,
        createdBy: "current-user",
        name: data.name,
        address: data.address || null,
        description: data.description || null,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        links: data.links || null,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Add optimistic accommodation to the cache if accommodations list exists
      if (previousAccommodations) {
        queryClient.setQueryData<Accommodation[]>(
          accommodationKeys.list(tripId),
          [optimisticAccommodation, ...previousAccommodations],
        );
      }

      // Return context with previous data for rollback
      return { previousAccommodations: previousAccommodations || undefined };
    },

    // On error: Rollback optimistic update
    onError: (_error, { tripId }, context) => {
      // Rollback to previous accommodations list if we had one
      if (context?.previousAccommodations) {
        queryClient.setQueryData(
          accommodationKeys.list(tripId),
          context.previousAccommodations,
        );
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: (_data, _error, { tripId }) => {
      queryClient.invalidateQueries({
        queryKey: accommodationKeys.list(tripId),
      });
    },
  });
}

/**
 * Get user-friendly error message from create mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getCreateAccommodationErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to add accommodations to this trip.";
      case "NOT_FOUND":
        return "Trip not found.";
      case "VALIDATION_ERROR":
        return "Please check your input and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to create an accommodation.";
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
interface UpdateAccommodationContext {
  previousAccommodations: Accommodation[] | undefined;
  previousAccommodation: Accommodation | undefined;
  tripId: string | undefined;
}

/**
 * Hook for updating an existing accommodation with optimistic updates
 *
 * Features:
 * - Optimistic updates: Updates accommodation in cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 * - Cache invalidation: Updates both accommodations list and individual accommodation cache
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useUpdateAccommodation();
 *
 * const handleSubmit = (accommodationId: string, data: UpdateAccommodationInput) => {
 *   mutate({ accommodationId, data });
 * };
 * ```
 */
export function useUpdateAccommodation() {
  const queryClient = useQueryClient();

  return useMutation<
    Accommodation,
    APIError,
    { accommodationId: string; data: UpdateAccommodationInput },
    UpdateAccommodationContext
  >({
    mutationKey: accommodationKeys.update(),
    mutationFn: async ({ accommodationId, data }) => {
      const response = await apiRequest<UpdateAccommodationResponse>(
        `/accommodations/${accommodationId}`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        },
      );
      return response.accommodation;
    },

    // Optimistic update: Update accommodation in cache immediately
    onMutate: async ({ accommodationId, data }) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: accommodationKeys.lists() });
      await queryClient.cancelQueries({
        queryKey: accommodationKeys.detail(accommodationId),
      });

      // Snapshot the previous values for rollback
      const previousAccommodation = queryClient.getQueryData<Accommodation>(
        accommodationKeys.detail(accommodationId),
      );

      // Find the accommodation in any trip's accommodation list
      let previousAccommodations: Accommodation[] | undefined;
      let tripId: string | undefined;

      if (previousAccommodation) {
        tripId = previousAccommodation.tripId;
        previousAccommodations = queryClient.getQueryData<Accommodation[]>(
          accommodationKeys.list(tripId),
        );
      }

      // Optimistically update the individual accommodation cache
      if (previousAccommodation) {
        const optimisticAccommodation: Accommodation = {
          ...previousAccommodation,
          name: data.name ?? previousAccommodation.name,
          address:
            data.address !== undefined
              ? (data.address ?? null)
              : previousAccommodation.address,
          description:
            data.description !== undefined
              ? (data.description ?? null)
              : previousAccommodation.description,
          checkIn: data.checkIn ?? previousAccommodation.checkIn,
          checkOut: data.checkOut ?? previousAccommodation.checkOut,
          links:
            data.links !== undefined
              ? (data.links ?? null)
              : previousAccommodation.links,
          updatedAt: new Date(),
        };

        queryClient.setQueryData<Accommodation>(
          accommodationKeys.detail(accommodationId),
          optimisticAccommodation,
        );

        // Also update the accommodation in the accommodations list cache
        if (previousAccommodations && tripId) {
          queryClient.setQueryData<Accommodation[]>(
            accommodationKeys.list(tripId),
            previousAccommodations.map((accommodation) =>
              accommodation.id === accommodationId
                ? optimisticAccommodation
                : accommodation,
            ),
          );
        }
      }

      // Return context with previous data for rollback
      return { previousAccommodations, previousAccommodation, tripId };
    },

    // On error: Rollback optimistic update
    onError: (_error, { accommodationId }, context) => {
      // Rollback to previous state if we had one
      if (context?.previousAccommodation) {
        queryClient.setQueryData(
          accommodationKeys.detail(accommodationId),
          context.previousAccommodation,
        );

        if (context.previousAccommodations) {
          const tripId = context.previousAccommodation.tripId;
          queryClient.setQueryData(
            accommodationKeys.list(tripId),
            context.previousAccommodations,
          );
        }
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: (data, _error, { accommodationId }, context) => {
      // Invalidate detail query
      queryClient.invalidateQueries({
        queryKey: accommodationKeys.detail(accommodationId),
      });

      // Invalidate the specific trip's list (and withDeleted variant via prefix match)
      const tripId =
        data?.tripId ??
        queryClient.getQueryData<Accommodation>(
          accommodationKeys.detail(accommodationId),
        )?.tripId ??
        context?.tripId;
      if (tripId) {
        queryClient.invalidateQueries({
          queryKey: accommodationKeys.list(tripId),
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
export function getUpdateAccommodationErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to edit this accommodation.";
      case "NOT_FOUND":
        return "Accommodation not found.";
      case "VALIDATION_ERROR":
        return "Please check your input and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to edit an accommodation.";
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
interface DeleteAccommodationContext {
  previousAccommodations: Accommodation[] | undefined;
  tripId: string | undefined;
}

/**
 * Hook for deleting (soft deleting) an accommodation
 *
 * Features:
 * - Optimistic updates: Removes accommodation from cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useDeleteAccommodation();
 *
 * const handleDelete = (accommodationId: string) => {
 *   mutate(accommodationId);
 * };
 * ```
 */
export function useDeleteAccommodation() {
  const queryClient = useQueryClient();

  return useMutation<void, APIError, string, DeleteAccommodationContext>({
    mutationKey: accommodationKeys.delete(),
    mutationFn: async (accommodationId: string) => {
      await apiRequest(`/accommodations/${accommodationId}`, {
        method: "DELETE",
      });
    },

    // Optimistic update: Remove accommodation from cache immediately
    onMutate: async (accommodationId) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: accommodationKeys.lists() });

      // Get the accommodation to find its tripId
      const accommodation = queryClient.getQueryData<Accommodation>(
        accommodationKeys.detail(accommodationId),
      );
      const tripId = accommodation?.tripId;

      // Snapshot the previous value for rollback
      let previousAccommodations: Accommodation[] | undefined;
      if (tripId) {
        previousAccommodations = queryClient.getQueryData<Accommodation[]>(
          accommodationKeys.list(tripId),
        );

        // Optimistically remove the accommodation from the cache
        if (previousAccommodations) {
          queryClient.setQueryData<Accommodation[]>(
            accommodationKeys.list(tripId),
            previousAccommodations.filter((a) => a.id !== accommodationId),
          );
        }
      }

      // Return context with previous data for rollback
      return { previousAccommodations, tripId };
    },

    // On error: Rollback optimistic update
    onError: (_error, _accommodationId, context) => {
      // Rollback to previous accommodations list if we had one
      if (context?.previousAccommodations && context.tripId) {
        queryClient.setQueryData(
          accommodationKeys.list(context.tripId),
          context.previousAccommodations,
        );
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: (_data, _error, _accommodationId, context) => {
      // Invalidate the specific trip's list (and withDeleted variant via prefix match)
      if (context?.tripId) {
        queryClient.invalidateQueries({
          queryKey: accommodationKeys.list(context.tripId),
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
export function getDeleteAccommodationErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to delete this accommodation.";
      case "NOT_FOUND":
        return "Accommodation not found.";
      case "UNAUTHORIZED":
        return "You must be logged in to delete an accommodation.";
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
interface RestoreAccommodationContext {
  previousAccommodations: Accommodation[] | undefined;
  tripId: string | undefined;
}

/**
 * Hook for restoring a soft-deleted accommodation
 *
 * Features:
 * - Optimistic updates: Adds accommodation back to cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useRestoreAccommodation();
 *
 * const handleRestore = (accommodationId: string) => {
 *   mutate(accommodationId);
 * };
 * ```
 */
export function useRestoreAccommodation() {
  const queryClient = useQueryClient();

  return useMutation<
    Accommodation,
    APIError,
    string,
    RestoreAccommodationContext
  >({
    mutationKey: accommodationKeys.restore(),
    mutationFn: async (accommodationId: string) => {
      const response = await apiRequest<RestoreAccommodationResponse>(
        `/accommodations/${accommodationId}/restore`,
        {
          method: "POST",
        },
      );
      return response.accommodation;
    },

    // Optimistic update: Add accommodation back to cache immediately
    onMutate: async (accommodationId) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({
        queryKey: accommodationKeys.lists(),
      });

      // Get the accommodation to find its tripId
      const accommodation = queryClient.getQueryData<Accommodation>(
        accommodationKeys.detail(accommodationId),
      );
      const tripId = accommodation?.tripId;

      // Snapshot the previous value for rollback
      let previousAccommodations: Accommodation[] | undefined;
      if (tripId) {
        previousAccommodations = queryClient.getQueryData<Accommodation[]>(
          accommodationKeys.list(tripId),
        );
      }

      // Return context with previous data for rollback
      return { previousAccommodations, tripId };
    },

    // On success: Update cache with restored accommodation
    onSuccess: (restoredAccommodation) => {
      const tripId = restoredAccommodation.tripId;

      // Update the accommodation in the accommodations list cache
      const previousAccommodations = queryClient.getQueryData<Accommodation[]>(
        accommodationKeys.list(tripId),
      );
      if (previousAccommodations) {
        queryClient.setQueryData<Accommodation[]>(
          accommodationKeys.list(tripId),
          [restoredAccommodation, ...previousAccommodations],
        );
      }

      // Update the individual accommodation cache
      queryClient.setQueryData<Accommodation>(
        accommodationKeys.detail(restoredAccommodation.id),
        restoredAccommodation,
      );
    },

    // On error: Rollback optimistic update
    onError: (_error, _accommodationId, context) => {
      // Rollback to previous accommodations list if we had one
      if (context?.previousAccommodations && context.tripId) {
        queryClient.setQueryData(
          accommodationKeys.list(context.tripId),
          context.previousAccommodations,
        );
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: (data, _error, _accommodationId, context) => {
      // Invalidate the specific trip's list (and withDeleted variant via prefix match)
      const tripId = data?.tripId ?? context?.tripId;
      if (tripId) {
        queryClient.invalidateQueries({
          queryKey: accommodationKeys.list(tripId),
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
export function getRestoreAccommodationErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to restore this accommodation.";
      case "NOT_FOUND":
        return "Accommodation not found.";
      case "UNAUTHORIZED":
        return "You must be logged in to restore an accommodation.";
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
