"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiRequest, APIError } from "@/lib/api";
import type { MemberWithProfile } from "@journiful/shared/types";
import { memberKeys, invitationKeys } from "./invitation-queries";
import { paymentKeys } from "./payment-queries";
import { balanceKeys } from "./balance-queries";

export function useCreatePlaceholder(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation<MemberWithProfile, APIError, { name: string; phoneNumber?: string }>({
    mutationKey: ["placeholders", "create", tripId],
    mutationFn: async (data) => {
      const res = await apiRequest<{ success: true; member: MemberWithProfile }>(`/trips/${tripId}/placeholders`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.member;
    },
    onSuccess: () => {
      toast.success("Person added");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: invitationKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: paymentKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: balanceKeys.trip(tripId) });
      queryClient.invalidateQueries({ queryKey: balanceKeys.me(tripId) });
    },
  });
}

export function useUpdatePlaceholder() {
  const queryClient = useQueryClient();
  return useMutation<MemberWithProfile, APIError, { memberId: string; data: { name?: string; phoneNumber?: string | null } }>({
    mutationKey: ["placeholders", "update"],
    mutationFn: async ({ memberId, data }) => {
      const res = await apiRequest<{ success: true; member: MemberWithProfile }>(`/placeholders/${memberId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      return res.member;
    },
    onSettled: (_data, _error, vars) => {
      // Invalidate all member lists (we don't know tripId, so invalidate all)
      queryClient.invalidateQueries({ queryKey: memberKeys.lists() });
      if (vars?.memberId) {
        queryClient.invalidateQueries({ queryKey: paymentKeys.lists() });
        queryClient.invalidateQueries({ queryKey: balanceKeys.all });
      }
    },
  });
}

export function useDeletePlaceholder(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, APIError, string>({
    mutationKey: ["placeholders", "delete", tripId],
    mutationFn: async (memberId) => {
      await apiRequest(`/placeholders/${memberId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast.success("Person removed");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: paymentKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: balanceKeys.trip(tripId) });
      queryClient.invalidateQueries({ queryKey: balanceKeys.me(tripId) });
    },
  });
}

export function useInvitePlaceholder(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation<{ success: true; invitation: unknown }, APIError, string>({
    mutationKey: ["placeholders", "invite", tripId],
    mutationFn: async (memberId) => {
      const res = await apiRequest<{ success: true; invitation: unknown }>(`/placeholders/${memberId}/invite`, { method: "POST" });
      return res;
    },
    onSuccess: () => {
      toast.success("Invite sent");
      queryClient.invalidateQueries({ queryKey: invitationKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
    },
  });
}

export function useLinkPlaceholder(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation<MemberWithProfile, APIError, { memberId: string; targetUserId: string }>({
    mutationKey: ["placeholders", "link", tripId],
    mutationFn: async ({ memberId, targetUserId }) => {
      const res = await apiRequest<{ success: true; member: MemberWithProfile }>(`/placeholders/${memberId}/link`, {
        method: "POST",
        body: JSON.stringify({ targetUserId }),
      });
      return res.member;
    },
    onSuccess: () => {
      toast.success("Person linked");
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: invitationKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: paymentKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: balanceKeys.trip(tripId) });
    },
  });
}

export function useAttachPlaceholder(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation<MemberWithProfile, APIError, { memberId: string; phoneNumber?: string; targetUserId?: string }>({
    mutationKey: ["placeholders", "attach", tripId],
    mutationFn: async ({ memberId, phoneNumber, targetUserId }) => {
      const body: Record<string, string> = {};
      if (phoneNumber) body.phoneNumber = phoneNumber;
      if (targetUserId) body.targetUserId = targetUserId;
      const res = await apiRequest<{ success: true; member: MemberWithProfile }>(`/placeholders/${memberId}/attach`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return res.member;
    },
    onSuccess: (member) => {
      if (!member.isPlaceholder) toast.success(`Linked to ${member.displayName}`);
      else toast.success("Phone attached — send invite to activate");
      queryClient.invalidateQueries({ queryKey: memberKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: invitationKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: paymentKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: balanceKeys.trip(tripId) });
      queryClient.invalidateQueries({ queryKey: balanceKeys.me(tripId) });
    },
  });
}

export function getPlaceholderErrorMessage(error: Error | null): string | null {
  if (!error) return null;
  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to manage placeholders.";
      case "MEMBER_NOT_FOUND":
        return "Person not found.";
      case "MEMBER_LIMIT_EXCEEDED":
        return "Trip is full (25 members).";
      case "INVITATION_NOT_FOUND":
        return "Person has no phone number to invite.";
      case "NOT_A_MUTUAL":
        return "User is not a mutual.";
      case "PHONE_TAKEN":
        return "Phone number already in use in this trip.";
      default:
        return error.message;
    }
  }
  if (error.message.includes("fetch") || error.message.includes("network") || error.message.toLowerCase().includes("failed to fetch")) {
    return "Network error: Please check your connection.";
  }
  return "An unexpected error occurred.";
}
