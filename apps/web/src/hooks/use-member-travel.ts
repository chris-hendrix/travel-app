"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiRequest, APIError } from "@/lib/api";
import type {
  CreateMemberTravelInput,
  UpdateMemberTravelInput,
} from "@journiful/shared/schemas";
import type {
  MemberTravel,
  CreateMemberTravelResponse,
  UpdateMemberTravelResponse,
  RestoreMemberTravelResponse,
} from "@journiful/shared/types";

// Import query keys and options from server-safe module for use in hooks
import {
  memberTravelKeys,
  memberTravelsQueryOptions,
  memberTravelsWithDeletedQueryOptions,
  memberTravelDetailQueryOptions,
} from "./member-travel-queries";

// Re-export for backward compatibility
export {
  memberTravelKeys,
  memberTravelsQueryOptions,
  memberTravelsWithDeletedQueryOptions,
  memberTravelDetailQueryOptions,
};

// Re-export types for backward compatibility with existing imports
export type { MemberTravel };

/**
 * Hook for fetching all member travels for a trip
 *
 * Features:
 * - Automatic caching: Results are cached with ["memberTravels", "list", tripId] key
 * - Returns MemberTravel array for the specified trip
 * - Error handling: Provides error state for failed requests
 *
 * @param tripId - The ID of the trip to fetch member travels for
 * @returns Query object with data, loading, and error state
 *
 * @example
 * ```tsx
 * const { data: memberTravels, isPending, isError, error, refetch } = useMemberTravels("trip-123");
 *
 * if (isPending) return <div>Loading...</div>;
 * if (isError) return <div>Error: {error.message}</div>;
 *
 * return memberTravels.map(memberTravel => <MemberTravelCard key={memberTravel.id} memberTravel={memberTravel} />);
 * ```
 */
export function useMemberTravels(tripId: string) {
  return useQuery({ ...memberTravelsQueryOptions(tripId), enabled: !!tripId });
}

/**
 * Hook for fetching all member travels for a trip, including soft-deleted ones
 *
 * Used by organizers to view and restore deleted items.
 *
 * @param tripId - The ID of the trip to fetch member travels for
 * @returns Query object with data, loading, and error state
 */
export function useMemberTravelsWithDeleted(tripId: string) {
  return useQuery({
    ...memberTravelsWithDeletedQueryOptions(tripId),
    enabled: !!tripId,
  });
}

/**
 * Hook for fetching a single member travel's detailed information
 *
 * Features:
 * - Automatic caching: Results are cached with ["memberTravels", "detail", memberTravelId] key
 * - Returns detailed member travel information
 * - Error handling: Provides error state for failed requests (404 if member travel not found or user has no access)
 *
 * @param memberTravelId - The ID of the member travel to fetch
 * @returns Query object with data, loading, and error state
 *
 * @example
 * ```tsx
 * const { data: memberTravel, isPending, isError, error, refetch } = useMemberTravelDetail("member-travel-123");
 *
 * if (isPending) return <div>Loading...</div>;
 * if (isError) return <div>Error: {error.message}</div>;
 *
 * return <MemberTravelDetailPage memberTravel={memberTravel} />;
 * ```
 */
export function useMemberTravelDetail(memberTravelId: string) {
  return useQuery({
    ...memberTravelDetailQueryOptions(memberTravelId),
    enabled: !!memberTravelId,
  });
}

/**
 * Hook for prefetching a member travel's details (e.g., on hover)
 *
 * @param memberTravelId - The ID of the member travel to prefetch
 * @returns A callback that triggers the prefetch
 */
export function usePrefetchMemberTravel(memberTravelId: string) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.prefetchQuery(
      memberTravelDetailQueryOptions(memberTravelId),
    );
  }, [queryClient, memberTravelId]);
}

/**
 * Context type for create mutation callbacks
 * Contains previous state for rollback on error
 */
interface CreateMemberTravelContext {
  previousMemberTravels: MemberTravel[] | undefined;
}

/**
 * Hook for creating a new member travel with optimistic updates
 *
 * Features:
 * - Optimistic updates: Adds member travel to cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useCreateMemberTravel();
 *
 * const handleSubmit = (tripId: string, data: CreateMemberTravelInput) => {
 *   mutate({ tripId, data });
 * };
 * ```
 */
export function useCreateMemberTravel() {
  const queryClient = useQueryClient();

  return useMutation<
    MemberTravel,
    APIError,
    { tripId: string; data: CreateMemberTravelInput },
    CreateMemberTravelContext
  >({
    mutationKey: memberTravelKeys.create(),
    mutationFn: async ({ tripId, data }) => {
      const response = await apiRequest<CreateMemberTravelResponse>(
        `/trips/${tripId}/member-travel`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
      return response.memberTravel;
    },

    // Optimistic update: Add member travel to cache immediately
    onMutate: async ({ tripId, data }) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: memberTravelKeys.lists() });

      // Snapshot the previous value for rollback
      const previousMemberTravels = queryClient.getQueryData<MemberTravel[]>(
        memberTravelKeys.list(tripId),
      );

      // Optimistically update the cache with a temporary member travel
      const optimisticMemberTravel: MemberTravel = {
        id: "temp-" + Date.now(),
        tripId,
        memberId: "current-member",
        travelType: data.travelType,
        time: new Date(data.time),
        location: data.location || null,
        details: data.details || null,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Add optimistic member travel to the cache if member travels list exists
      if (previousMemberTravels) {
        queryClient.setQueryData<MemberTravel[]>(
          memberTravelKeys.list(tripId),
          [optimisticMemberTravel, ...previousMemberTravels],
        );
      }

      // Return context with previous data for rollback
      return { previousMemberTravels: previousMemberTravels || undefined };
    },

    // On error: Rollback optimistic update
    onError: (_error, { tripId }, context) => {
      // Rollback to previous member travels list if we had one
      if (context?.previousMemberTravels) {
        queryClient.setQueryData(
          memberTravelKeys.list(tripId),
          context.previousMemberTravels,
        );
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: (_data, _error, { tripId }) => {
      queryClient.invalidateQueries({
        queryKey: memberTravelKeys.list(tripId),
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
export function getCreateMemberTravelErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to add member travel to this trip.";
      case "NOT_FOUND":
        return "Trip not found.";
      case "VALIDATION_ERROR":
        return "Please check your input and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to create member travel.";
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
interface UpdateMemberTravelContext {
  previousMemberTravels: MemberTravel[] | undefined;
  previousMemberTravel: MemberTravel | undefined;
  tripId: string | undefined;
}

/**
 * Hook for updating an existing member travel with optimistic updates
 *
 * Features:
 * - Optimistic updates: Updates member travel in cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 * - Cache invalidation: Updates both member travels list and individual member travel cache
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useUpdateMemberTravel();
 *
 * const handleSubmit = (memberTravelId: string, data: UpdateMemberTravelInput) => {
 *   mutate({ memberTravelId, data });
 * };
 * ```
 */
export function useUpdateMemberTravel() {
  const queryClient = useQueryClient();

  return useMutation<
    MemberTravel,
    APIError,
    { memberTravelId: string; data: UpdateMemberTravelInput },
    UpdateMemberTravelContext
  >({
    mutationKey: memberTravelKeys.update(),
    mutationFn: async ({ memberTravelId, data }) => {
      const response = await apiRequest<UpdateMemberTravelResponse>(
        `/member-travel/${memberTravelId}`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        },
      );
      return response.memberTravel;
    },

    // Optimistic update: Update member travel in cache immediately
    onMutate: async ({ memberTravelId, data }) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: memberTravelKeys.lists() });
      await queryClient.cancelQueries({
        queryKey: memberTravelKeys.detail(memberTravelId),
      });

      // Snapshot the previous values for rollback
      const previousMemberTravel = queryClient.getQueryData<MemberTravel>(
        memberTravelKeys.detail(memberTravelId),
      );

      // Find the member travel in any trip's member travel list
      let previousMemberTravels: MemberTravel[] | undefined;
      let tripId: string | undefined;

      if (previousMemberTravel) {
        tripId = previousMemberTravel.tripId;
        previousMemberTravels = queryClient.getQueryData<MemberTravel[]>(
          memberTravelKeys.list(tripId),
        );
      }

      // Optimistically update the individual member travel cache
      if (previousMemberTravel) {
        const optimisticMemberTravel: MemberTravel = {
          ...previousMemberTravel,
          travelType: data.travelType ?? previousMemberTravel.travelType,
          time: data.time ? new Date(data.time) : previousMemberTravel.time,
          location:
            data.location !== undefined
              ? (data.location ?? null)
              : previousMemberTravel.location,
          details:
            data.details !== undefined
              ? (data.details ?? null)
              : previousMemberTravel.details,
          updatedAt: new Date(),
        };

        queryClient.setQueryData<MemberTravel>(
          memberTravelKeys.detail(memberTravelId),
          optimisticMemberTravel,
        );

        // Also update the member travel in the member travels list cache
        if (previousMemberTravels && tripId) {
          queryClient.setQueryData<MemberTravel[]>(
            memberTravelKeys.list(tripId),
            previousMemberTravels.map((memberTravel) =>
              memberTravel.id === memberTravelId
                ? optimisticMemberTravel
                : memberTravel,
            ),
          );
        }
      }

      // Return context with previous data for rollback
      return { previousMemberTravels, previousMemberTravel, tripId };
    },

    // On error: Rollback optimistic update
    onError: (_error, { memberTravelId }, context) => {
      // Rollback to previous state if we had one
      if (context?.previousMemberTravel) {
        queryClient.setQueryData(
          memberTravelKeys.detail(memberTravelId),
          context.previousMemberTravel,
        );

        if (context.previousMemberTravels) {
          const tripId = context.previousMemberTravel.tripId;
          queryClient.setQueryData(
            memberTravelKeys.list(tripId),
            context.previousMemberTravels,
          );
        }
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: (data, _error, { memberTravelId }, context) => {
      // Invalidate detail query
      queryClient.invalidateQueries({
        queryKey: memberTravelKeys.detail(memberTravelId),
      });

      // Invalidate the specific trip's list (and withDeleted variant via prefix match)
      const tripId =
        data?.tripId ??
        queryClient.getQueryData<MemberTravel>(
          memberTravelKeys.detail(memberTravelId),
        )?.tripId ??
        context?.tripId;
      if (tripId) {
        queryClient.invalidateQueries({
          queryKey: memberTravelKeys.list(tripId),
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
export function getUpdateMemberTravelErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to edit this member travel.";
      case "NOT_FOUND":
        return "Member travel not found.";
      case "VALIDATION_ERROR":
        return "Please check your input and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to edit member travel.";
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
interface DeleteMemberTravelContext {
  previousMemberTravels: MemberTravel[] | undefined;
  tripId: string | undefined;
}

/**
 * Hook for deleting (soft deleting) a member travel
 *
 * Features:
 * - Optimistic updates: Removes member travel from cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useDeleteMemberTravel();
 *
 * const handleDelete = (memberTravelId: string) => {
 *   mutate(memberTravelId);
 * };
 * ```
 */
export function useDeleteMemberTravel() {
  const queryClient = useQueryClient();

  return useMutation<void, APIError, string, DeleteMemberTravelContext>({
    mutationKey: memberTravelKeys.delete(),
    mutationFn: async (memberTravelId: string) => {
      await apiRequest(`/member-travel/${memberTravelId}`, {
        method: "DELETE",
      });
    },

    // Optimistic update: Remove member travel from cache immediately
    onMutate: async (memberTravelId) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: memberTravelKeys.lists() });

      // Get the member travel to find its tripId
      const memberTravel = queryClient.getQueryData<MemberTravel>(
        memberTravelKeys.detail(memberTravelId),
      );
      const tripId = memberTravel?.tripId;

      // Snapshot the previous value for rollback
      let previousMemberTravels: MemberTravel[] | undefined;
      if (tripId) {
        previousMemberTravels = queryClient.getQueryData<MemberTravel[]>(
          memberTravelKeys.list(tripId),
        );

        // Optimistically remove the member travel from the cache
        if (previousMemberTravels) {
          queryClient.setQueryData<MemberTravel[]>(
            memberTravelKeys.list(tripId),
            previousMemberTravels.filter((mt) => mt.id !== memberTravelId),
          );
        }
      }

      // Return context with previous data for rollback
      return { previousMemberTravels, tripId };
    },

    // On error: Rollback optimistic update
    onError: (_error, _memberTravelId, context) => {
      // Rollback to previous member travels list if we had one
      if (context?.previousMemberTravels && context.tripId) {
        queryClient.setQueryData(
          memberTravelKeys.list(context.tripId),
          context.previousMemberTravels,
        );
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: (_data, _error, _memberTravelId, context) => {
      // Invalidate the specific trip's list (and withDeleted variant via prefix match)
      if (context?.tripId) {
        queryClient.invalidateQueries({
          queryKey: memberTravelKeys.list(context.tripId),
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
export function getDeleteMemberTravelErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to delete this member travel.";
      case "NOT_FOUND":
        return "Member travel not found.";
      case "UNAUTHORIZED":
        return "You must be logged in to delete member travel.";
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
interface RestoreMemberTravelContext {
  previousMemberTravels: MemberTravel[] | undefined;
  tripId: string | undefined;
}

/**
 * Hook for restoring a soft-deleted member travel
 *
 * Features:
 * - Optimistic updates: Adds member travel back to cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Network error handling: Provides user-friendly error messages
 *
 * @returns Mutation object with mutate function and state
 *
 * @example
 * ```tsx
 * const { mutate, isPending, error } = useRestoreMemberTravel();
 *
 * const handleRestore = (memberTravelId: string) => {
 *   mutate(memberTravelId);
 * };
 * ```
 */
export function useRestoreMemberTravel() {
  const queryClient = useQueryClient();

  return useMutation<
    MemberTravel,
    APIError,
    string,
    RestoreMemberTravelContext
  >({
    mutationKey: memberTravelKeys.restore(),
    mutationFn: async (memberTravelId: string) => {
      const response = await apiRequest<RestoreMemberTravelResponse>(
        `/member-travel/${memberTravelId}/restore`,
        {
          method: "POST",
        },
      );
      return response.memberTravel;
    },

    // Optimistic update: Add member travel back to cache immediately
    onMutate: async (memberTravelId) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: memberTravelKeys.lists() });

      // Get the member travel to find its tripId
      const memberTravel = queryClient.getQueryData<MemberTravel>(
        memberTravelKeys.detail(memberTravelId),
      );
      const tripId = memberTravel?.tripId;

      // Snapshot the previous value for rollback
      let previousMemberTravels: MemberTravel[] | undefined;
      if (tripId) {
        previousMemberTravels = queryClient.getQueryData<MemberTravel[]>(
          memberTravelKeys.list(tripId),
        );
      }

      // Return context with previous data for rollback
      return { previousMemberTravels, tripId };
    },

    // On success: Update cache with restored member travel
    onSuccess: (restoredMemberTravel) => {
      const tripId = restoredMemberTravel.tripId;

      // Update the member travel in the member travels list cache
      const previousMemberTravels = queryClient.getQueryData<MemberTravel[]>(
        memberTravelKeys.list(tripId),
      );
      if (previousMemberTravels) {
        queryClient.setQueryData<MemberTravel[]>(
          memberTravelKeys.list(tripId),
          [restoredMemberTravel, ...previousMemberTravels],
        );
      }

      // Update the individual member travel cache
      queryClient.setQueryData<MemberTravel>(
        memberTravelKeys.detail(restoredMemberTravel.id),
        restoredMemberTravel,
      );
    },

    // On error: Rollback optimistic update
    onError: (_error, _memberTravelId, context) => {
      // Rollback to previous member travels list if we had one
      if (context?.previousMemberTravels && context.tripId) {
        queryClient.setQueryData(
          memberTravelKeys.list(context.tripId),
          context.previousMemberTravels,
        );
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    // This ensures the cache stays in sync with the server
    onSettled: (data, _error, _memberTravelId, context) => {
      // Invalidate the specific trip's list (and withDeleted variant via prefix match)
      const tripId = data?.tripId ?? context?.tripId;
      if (tripId) {
        queryClient.invalidateQueries({
          queryKey: memberTravelKeys.list(tripId),
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
export function getRestoreMemberTravelErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to restore this member travel.";
      case "NOT_FOUND":
        return "Member travel not found.";
      case "UNAUTHORIZED":
        return "You must be logged in to restore member travel.";
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
