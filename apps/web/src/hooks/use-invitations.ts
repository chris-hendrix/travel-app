"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, APIError } from "@/lib/api";
import type {
  CreateInvitationsInput,
  UpdateRsvpInput,
  UpdateMySettingsInput,
} from "@tripful/shared/schemas";
import type {
  Invitation,
  MemberWithProfile,
  CreateInvitationsResponse,
  UpdateRsvpResponse,
} from "@tripful/shared/types";

// Import query keys and options from server-safe module for use in hooks
import {
  invitationKeys,
  memberKeys,
  rsvpKeys,
  mySettingsKeys,
  invitationsQueryOptions,
  membersQueryOptions,
  mySettingsQueryOptions,
} from "./invitation-queries";

// Import trip keys and types for cache invalidation and optimistic updates on RSVP
import { tripKeys, type TripDetailWithMeta } from "./trip-queries";

// Import event keys for cache invalidation on member removal (creatorAttending depends on member existence)
import { eventKeys } from "./event-queries";

// Import mutual keys for cache invalidation on invite (suggestions may change)
import { mutualKeys } from "./mutuals-queries";

// Re-export for backward compatibility
export {
  invitationKeys,
  memberKeys,
  rsvpKeys,
  mySettingsKeys,
  invitationsQueryOptions,
  membersQueryOptions,
  mySettingsQueryOptions,
};

// Re-export types for backward compatibility with existing imports
export type { Invitation, MemberWithProfile };

/**
 * Hook for fetching invitations for a trip (organizers only)
 *
 * @param tripId - The ID of the trip to fetch invitations for
 * @returns Query object with data, loading, and error state
 */
export function useInvitations(
  tripId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    ...invitationsQueryOptions(tripId),
    enabled: (options?.enabled ?? true) && !!tripId,
  });
}

/**
 * Hook for fetching members for a trip
 *
 * @param tripId - The ID of the trip to fetch members for
 * @returns Query object with data, loading, and error state
 */
export function useMembers(tripId: string) {
  return useQuery({ ...membersQueryOptions(tripId), enabled: !!tripId });
}

/**
 * Hook for batch inviting members to a trip
 *
 * @param tripId - The ID of the trip to invite members to
 * @returns Mutation object with mutate function and state
 */
export function useInviteMembers(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    CreateInvitationsResponse,
    APIError,
    CreateInvitationsInput
  >({
    mutationKey: invitationKeys.create(),
    mutationFn: async (data) => {
      const response = await apiRequest<CreateInvitationsResponse>(
        `/trips/${tripId}/invitations`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
      return response;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      queryClient.invalidateQueries({
        queryKey: tripKeys.all,
        exact: true,
      });
      queryClient.invalidateQueries({
        queryKey: mutualKeys.suggestion(tripId),
      });
    },
  });
}

/**
 * Hook for revoking an invitation
 *
 * @param tripId - The ID of the trip the invitation belongs to
 * @returns Mutation object with mutate function and state
 */
export function useRevokeInvitation(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, APIError, string>({
    mutationKey: invitationKeys.revoke(),
    mutationFn: async (invitationId: string) => {
      await apiRequest(`/invitations/${invitationId}`, {
        method: "DELETE",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
    },
  });
}

/**
 * Hook for removing a member from a trip
 *
 * @param tripId - The ID of the trip
 * @returns Mutation object with mutate function and state
 */
export function useRemoveMember(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, APIError, string>({
    mutationKey: memberKeys.remove(tripId),
    mutationFn: async (memberId: string) => {
      await apiRequest(`/trips/${tripId}/members/${memberId}`, {
        method: "DELETE",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      queryClient.invalidateQueries({
        queryKey: tripKeys.all,
        exact: true,
      });
      // Invalidate events since creatorAttending depends on the member's existence
      queryClient.invalidateQueries({ queryKey: eventKeys.list(tripId) });
    },
  });
}

/**
 * Get user-friendly error message from remove member mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getRemoveMemberErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to remove members from this trip.";
      case "MEMBER_NOT_FOUND":
        return "Member not found.";
      case "CANNOT_REMOVE_CREATOR":
        return "The trip creator cannot be removed.";
      case "LAST_ORGANIZER":
        return "Cannot remove the last organizer of a trip.";
      case "UNAUTHORIZED":
        return "You must be logged in to remove a member.";
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
 * Hook for updating a member's organizer role
 *
 * @param tripId - The ID of the trip
 * @returns Mutation object with mutate function and state
 */
export function useUpdateMemberRole(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    { success: true },
    APIError,
    { memberId: string; isOrganizer: boolean }
  >({
    mutationKey: memberKeys.updateRole(tripId),
    mutationFn: async ({ memberId, isOrganizer }) => {
      return await apiRequest<{ success: true }>(
        `/trips/${tripId}/members/${memberId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ isOrganizer }),
        },
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: invitationKeys.list(tripId),
      });
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      queryClient.invalidateQueries({
        queryKey: tripKeys.all,
        exact: true,
      });
    },
  });
}

/**
 * Get user-friendly error message from update member role mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getUpdateMemberRoleErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to change member roles.";
      case "MEMBER_NOT_FOUND":
        return "Member not found.";
      case "CANNOT_MODIFY_OWN_ROLE":
        return "You cannot change your own role.";
      case "CANNOT_DEMOTE_CREATOR":
        return "The trip creator's role cannot be changed.";
      case "LAST_ORGANIZER":
        return "Cannot remove the last organizer.";
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
 * Hook for updating RSVP status for the current user
 *
 * @param tripId - The ID of the trip to update RSVP for
 * @returns Mutation object with mutate function and state
 */
export function useUpdateRsvp(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    MemberWithProfile,
    APIError,
    UpdateRsvpInput,
    { previousTrip: TripDetailWithMeta | undefined }
  >({
    mutationKey: rsvpKeys.update(),
    mutationFn: async (data) => {
      const response = await apiRequest<UpdateRsvpResponse>(
        `/trips/${tripId}/rsvp`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
      return response.member;
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: tripKeys.detail(tripId) });

      const previousTrip = queryClient.getQueryData<TripDetailWithMeta>(
        tripKeys.detail(tripId),
      );

      if (previousTrip) {
        queryClient.setQueryData<TripDetailWithMeta>(tripKeys.detail(tripId), {
          ...previousTrip,
          userRsvpStatus: data.status,
        });
      }

      return { previousTrip };
    },
    onError: (_error, _data, context) => {
      if (context?.previousTrip) {
        queryClient.setQueryData(tripKeys.detail(tripId), context.previousTrip);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      queryClient.invalidateQueries({
        queryKey: tripKeys.all,
        exact: true,
      });
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
    },
  });
}

/**
 * Get user-friendly error message from invite members mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getInviteMembersErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to invite members to this trip.";
      case "MEMBER_LIMIT_EXCEEDED":
        return "Cannot invite more members: the trip has reached the maximum member limit.";
      case "VALIDATION_ERROR":
        return "Please check your input and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to invite members.";
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
 * Get user-friendly error message from revoke invitation mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getRevokeInvitationErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to revoke this invitation.";
      case "INVITATION_NOT_FOUND":
        return "Invitation not found.";
      case "UNAUTHORIZED":
        return "You must be logged in to revoke an invitation.";
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
 * Get user-friendly error message from update RSVP mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getUpdateRsvpErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to update your RSVP for this trip.";
      case "NOT_FOUND":
        return "Trip not found.";
      case "VALIDATION_ERROR":
        return "Please check your input and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to update your RSVP.";
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
 * Hook for fetching my-settings (privacy) for a trip
 *
 * @param tripId - The ID of the trip
 * @returns Query object with sharePhone boolean data
 */
export function useMySettings(tripId: string) {
  return useQuery({ ...mySettingsQueryOptions(tripId), enabled: !!tripId });
}

/**
 * Hook for updating my-settings (privacy) for a trip
 *
 * @param tripId - The ID of the trip
 * @returns Mutation object with mutate function and state
 */
export function useUpdateMySettings(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    { success: true; sharePhone: boolean; calendarExcluded: boolean },
    APIError,
    UpdateMySettingsInput
  >({
    mutationKey: mySettingsKeys.update(),
    mutationFn: async (data) => {
      const response = await apiRequest<{
        success: true;
        sharePhone: boolean;
        calendarExcluded: boolean;
      }>(`/trips/${tripId}/my-settings`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return response;
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: mySettingsKeys.detail(tripId),
      });
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
    },
  });
}

/**
 * Get user-friendly error message from update my-settings mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message
 */
export function getUpdateMySettingsErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to update these settings.";
      case "MEMBER_NOT_FOUND":
        return "You are not a member of this trip.";
      case "UNAUTHORIZED":
        return "Please sign in to update your settings.";
      case "VALIDATION_ERROR":
        return "Invalid settings data. Please try again.";
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
