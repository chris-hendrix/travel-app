"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, APIError } from "@/lib/api";
import type { MemberWithProfile } from "@journiful/shared/types";
import type { UpdateGuestInput } from "@journiful/shared/schemas";
import { memberKeys, invitationKeys } from "./invitation-queries";

interface UpdateGuestContext {
  previousMembers: MemberWithProfile[] | undefined;
}

/**
 * Hook for updating a guest member (organizer-only) with optimistic updates.
 * PATCH /trips/:tripId/members/guests/:memberId
 */
export function useUpdateGuest(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    MemberWithProfile,
    APIError,
    { memberId: string; data: UpdateGuestInput },
    UpdateGuestContext
  >({
    mutationKey: ["guests", "update", tripId],
    mutationFn: async ({ memberId, data }) => {
      const response = await apiRequest<{ member: MemberWithProfile }>(
        `/trips/${tripId}/members/guests/${memberId}`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
      );
      return response.member;
    },
    onMutate: async ({ memberId, data }) => {
      await queryClient.cancelQueries({
        queryKey: memberKeys.list(tripId),
      });

      const previousMembers = queryClient.getQueryData<MemberWithProfile[]>(
        memberKeys.list(tripId),
      );

      if (previousMembers) {
        queryClient.setQueryData<MemberWithProfile[]>(
          memberKeys.list(tripId),
          previousMembers.map((m) =>
            m.id === memberId
              ? {
                  ...m,
                  displayName: data.displayName ?? m.displayName,
                  ...(data.guestPhone !== undefined
                    ? { guestPhone: data.guestPhone }
                    : {}),
                  status: data.status ?? m.status,
                }
              : m,
          ),
        );
      }

      return { previousMembers };
    },
    onError: (_error, _vars, context) => {
      if (context?.previousMembers) {
        queryClient.setQueryData(
          memberKeys.list(tripId),
          context.previousMembers,
        );
      }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
      // PATCH can change guestPhone, which is the invite-matching key, so
      // the invitations list can go stale. displayName/status-only patches
      // never touch invite state.
      if (vars.data.guestPhone !== undefined) {
        queryClient.invalidateQueries({
          queryKey: invitationKeys.list(tripId),
        });
      }
      // tripKeys.detail intentionally not invalidated: TripDetail only embeds
      // memberCount, and PATCH never adds/removes members so the count is
      // unchanged by guest edits.
    },
  });
}

export function getUpdateGuestErrorMessage(error: Error | null): string | null {
  if (!error) return null;
  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to edit this guest.";
      case "MEMBER_NOT_FOUND":
        return "Guest not found.";
      case "MEMBER_ALREADY_EXISTS":
        return "This phone number is already in this trip.";
      case "VALIDATION_ERROR":
        return "Check the name and phone number and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to edit guests.";
      default:
        return error.message;
    }
  }
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Connection failed. Check your connection and try again.";
  }
  return "Something went wrong. Try again.";
}
