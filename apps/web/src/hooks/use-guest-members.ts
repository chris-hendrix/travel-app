"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, APIError } from "@/lib/api";
import type { MemberWithProfile } from "@journiful/shared/types";
import { memberKeys } from "./invitation-queries";
import { tripKeys } from "./trip-queries";

export interface UpdateGuestInput {
  displayName?: string | undefined;
  guestPhone?: string | null | undefined;
  status?: MemberWithProfile["status"];
}

/**
 * Hook for updating a guest member (organizer-only).
 * PATCH /trips/:tripId/members/guests/:memberId
 */
export function useUpdateGuest(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    MemberWithProfile,
    APIError,
    { memberId: string; data: UpdateGuestInput }
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
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
        return "Please check your input and try again.";
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
    return "Network error: Please check your connection and try again.";
  }
  return "An unexpected error occurred. Please try again.";
}
