"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiRequest, APIError } from "@/lib/api";
import type {
  CreateGuestInput,
  UpdateGuestInput,
} from "@journiful/shared/schemas";
import type { Guest, GuestResponse } from "@journiful/shared/types";
import { guestKeys, guestsQueryOptions } from "./guest-queries";
import { paymentKeys } from "./payment-queries";
import { balanceKeys } from "./balance-queries";

// Re-export for convenience
export { guestKeys, guestsQueryOptions };
export type { Guest };

/**
 * Hook for fetching all guests for a trip
 */
export function useGuests(tripId: string, options?: { enabled?: boolean }) {
  return useQuery({
    ...guestsQueryOptions(tripId),
    enabled: (options?.enabled ?? true) && !!tripId,
  });
}

interface CreateGuestContext {
  previousGuests: Guest[] | undefined;
}

/**
 * Hook for creating a new guest with optimistic updates
 */
export function useCreateGuest() {
  const queryClient = useQueryClient();

  return useMutation<
    Guest,
    APIError,
    { tripId: string; data: CreateGuestInput },
    CreateGuestContext
  >({
    mutationKey: ["guests", "create"],
    mutationFn: async ({ tripId, data }) => {
      const response = await apiRequest<GuestResponse>(
        `/trips/${tripId}/guests`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
      return response.guest;
    },

    onMutate: async ({ tripId, data }) => {
      await queryClient.cancelQueries({ queryKey: guestKeys.lists() });

      const previousGuests = queryClient.getQueryData<Guest[]>(
        guestKeys.list(tripId),
      );

      const optimisticGuest: Guest = {
        id: "temp-" + Date.now(),
        tripId,
        name: data.name,
        createdBy: "current-user",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (previousGuests) {
        queryClient.setQueryData<Guest[]>(guestKeys.list(tripId), [
          ...previousGuests,
          optimisticGuest,
        ]);
      }

      return { previousGuests };
    },

    onError: (_error, { tripId }, context) => {
      if (context?.previousGuests) {
        queryClient.setQueryData(
          guestKeys.list(tripId),
          context.previousGuests,
        );
      }
    },

    onSettled: (_data, _error, { tripId }) => {
      queryClient.invalidateQueries({ queryKey: guestKeys.list(tripId) });
    },
  });
}

interface UpdateGuestContext {
  previousGuests: Guest[] | undefined;
  tripId: string | undefined;
}

/**
 * Hook for updating a guest with optimistic updates
 */
export function useUpdateGuest() {
  const queryClient = useQueryClient();

  return useMutation<
    Guest,
    APIError,
    { guestId: string; data: UpdateGuestInput },
    UpdateGuestContext
  >({
    mutationKey: ["guests", "update"],
    mutationFn: async ({ guestId, data }) => {
      const response = await apiRequest<GuestResponse>(
        `/guests/${guestId}`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        },
      );
      return response.guest;
    },

    onMutate: async ({ guestId, data }) => {
      await queryClient.cancelQueries({ queryKey: guestKeys.lists() });

      let previousGuests: Guest[] | undefined;
      let tripId: string | undefined;

      const listQueries = queryClient.getQueriesData<Guest[]>({
        queryKey: guestKeys.lists(),
      });
      for (const [key, list] of listQueries) {
        const found = list?.find((g) => g.id === guestId);
        if (found) {
          tripId = found.tripId;
          previousGuests = list;
          queryClient.setQueryData<Guest[]>(
            key,
            list!.map((g) =>
              g.id === guestId
                ? { ...g, name: data.name, updatedAt: new Date() }
                : g,
            ),
          );
          break;
        }
      }

      return { previousGuests, tripId };
    },

    onError: (_error, _vars, context) => {
      if (context?.previousGuests && context.tripId) {
        queryClient.setQueryData(
          guestKeys.list(context.tripId),
          context.previousGuests,
        );
      }
    },

    onSettled: (data, _error, _vars, context) => {
      const tripId = data?.tripId ?? context?.tripId;
      if (tripId) {
        queryClient.invalidateQueries({ queryKey: guestKeys.list(tripId) });
      }
    },
  });
}

interface DeleteGuestContext {
  previousGuests: Guest[] | undefined;
  tripId: string | undefined;
}

/**
 * Hook for deleting a guest with optimistic updates
 */
export function useDeleteGuest() {
  const queryClient = useQueryClient();

  return useMutation<void, APIError, string, DeleteGuestContext>({
    mutationKey: ["guests", "delete"],
    mutationFn: async (guestId: string) => {
      await apiRequest(`/guests/${guestId}`, {
        method: "DELETE",
      });
    },

    onMutate: async (guestId) => {
      await queryClient.cancelQueries({ queryKey: guestKeys.lists() });

      let previousGuests: Guest[] | undefined;
      let tripId: string | undefined;

      const listQueries = queryClient.getQueriesData<Guest[]>({
        queryKey: guestKeys.lists(),
      });
      for (const [key, list] of listQueries) {
        const found = list?.find((g) => g.id === guestId);
        if (found) {
          tripId = found.tripId;
          previousGuests = list;
          queryClient.setQueryData<Guest[]>(
            key,
            list!.filter((g) => g.id !== guestId),
          );
          break;
        }
      }

      return { previousGuests, tripId };
    },

    onSuccess: () => {
      toast.success("Guest removed");
    },

    onError: (_error, _guestId, context) => {
      if (context?.previousGuests && context.tripId) {
        queryClient.setQueryData(
          guestKeys.list(context.tripId),
          context.previousGuests,
        );
      }
    },

    onSettled: (_data, _error, _guestId, context) => {
      if (context?.tripId) {
        queryClient.invalidateQueries({
          queryKey: guestKeys.list(context.tripId),
        });
        // Guest deletion may affect payments and balances
        queryClient.invalidateQueries({
          queryKey: paymentKeys.list(context.tripId),
        });
        queryClient.invalidateQueries({
          queryKey: balanceKeys.trip(context.tripId),
        });
        queryClient.invalidateQueries({
          queryKey: balanceKeys.me(context.tripId),
        });
      }
    },
  });
}

/**
 * Get user-friendly error message from guest mutation error
 */
export function getGuestErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to modify this guest.";
      case "NOT_FOUND":
        return "Guest not found.";
      case "VALIDATION_ERROR":
        return "Please check your input and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to manage guests.";
      case "CONFLICT":
        return "This guest has payments and cannot be deleted.";
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
