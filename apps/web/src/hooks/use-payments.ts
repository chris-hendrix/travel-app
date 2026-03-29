"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiRequest, APIError } from "@/lib/api";
import type {
  CreatePaymentInput,
  UpdatePaymentInput,
} from "@journiful/shared/schemas";
import type { Payment, PaymentResponse } from "@journiful/shared/types";
import { paymentKeys, paymentsQueryOptions } from "./payment-queries";
import { balanceKeys } from "./balance-queries";

// Re-export for convenience
export { paymentKeys, paymentsQueryOptions };
export type { Payment };

/**
 * Hook for fetching all payments for a trip
 */
export function usePayments(tripId: string, options?: { enabled?: boolean }) {
  return useQuery({
    ...paymentsQueryOptions(tripId),
    enabled: (options?.enabled ?? true) && !!tripId,
  });
}

interface CreatePaymentContext {
  previousPayments: Payment[] | undefined;
}

/**
 * Hook for creating a new payment with optimistic updates
 */
export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation<
    Payment,
    APIError,
    { tripId: string; data: CreatePaymentInput },
    CreatePaymentContext
  >({
    mutationKey: ["payments", "create"],
    mutationFn: async ({ tripId, data }) => {
      const response = await apiRequest<PaymentResponse>(
        `/trips/${tripId}/payments`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
      return response.payment;
    },

    onMutate: async ({ tripId, data }) => {
      await queryClient.cancelQueries({ queryKey: paymentKeys.lists() });

      const previousPayments = queryClient.getQueryData<Payment[]>(
        paymentKeys.list(tripId),
      );

      const optimisticPayment: Payment = {
        id: "temp-" + Date.now(),
        tripId,
        description: data.description,
        amount: data.amount,
        userId: data.userId ?? null,
        guestId: data.guestId ?? null,
        date: data.date ? new Date(data.date) : new Date(),
        createdBy: "current-user",
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        participants: data.participants.map((p, i) => ({
          id: "temp-participant-" + i,
          paymentId: "temp-" + Date.now(),
          userId: p.userId ?? null,
          guestId: p.guestId ?? null,
          shareAmount: Math.floor(data.amount / data.participants.length),
          createdAt: new Date(),
        })),
      };

      if (previousPayments) {
        queryClient.setQueryData<Payment[]>(paymentKeys.list(tripId), [
          optimisticPayment,
          ...previousPayments,
        ]);
      }

      return { previousPayments };
    },

    onError: (_error, { tripId }, context) => {
      if (context?.previousPayments) {
        queryClient.setQueryData(
          paymentKeys.list(tripId),
          context.previousPayments,
        );
      }
    },

    onSettled: (_data, _error, { tripId }) => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.list(tripId) });
      queryClient.invalidateQueries({ queryKey: balanceKeys.trip(tripId) });
      queryClient.invalidateQueries({ queryKey: balanceKeys.me(tripId) });
    },
  });
}

interface UpdatePaymentContext {
  previousPayments: Payment[] | undefined;
  tripId: string | undefined;
}

/**
 * Hook for updating an existing payment with optimistic updates
 */
export function useUpdatePayment() {
  const queryClient = useQueryClient();

  return useMutation<
    Payment,
    APIError,
    { paymentId: string; data: UpdatePaymentInput },
    UpdatePaymentContext
  >({
    mutationKey: ["payments", "update"],
    mutationFn: async ({ paymentId, data }) => {
      const response = await apiRequest<PaymentResponse>(
        `/payments/${paymentId}`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        },
      );
      return response.payment;
    },

    onMutate: async ({ paymentId, data }) => {
      await queryClient.cancelQueries({ queryKey: paymentKeys.lists() });

      let previousPayments: Payment[] | undefined;
      let tripId: string | undefined;

      const listQueries = queryClient.getQueriesData<Payment[]>({
        queryKey: paymentKeys.lists(),
      });
      for (const [key, list] of listQueries) {
        const found = list?.find((p) => p.id === paymentId);
        if (found) {
          tripId = found.tripId;
          previousPayments = list;

          queryClient.setQueryData<Payment[]>(
            key,
            list!.map((p) =>
              p.id === paymentId
                ? {
                    ...p,
                    description: data.description ?? p.description,
                    amount: data.amount ?? p.amount,
                    userId:
                      data.userId !== undefined
                        ? (data.userId ?? null)
                        : p.userId,
                    guestId:
                      data.guestId !== undefined
                        ? (data.guestId ?? null)
                        : p.guestId,
                    date: data.date ? new Date(data.date) : p.date,
                    updatedAt: new Date(),
                  }
                : p,
            ),
          );
          break;
        }
      }

      return { previousPayments, tripId };
    },

    onError: (_error, _vars, context) => {
      if (context?.previousPayments && context.tripId) {
        queryClient.setQueryData(
          paymentKeys.list(context.tripId),
          context.previousPayments,
        );
      }
    },

    onSettled: (data, _error, _vars, context) => {
      const tripId = data?.tripId ?? context?.tripId;
      if (tripId) {
        queryClient.invalidateQueries({ queryKey: paymentKeys.list(tripId) });
        queryClient.invalidateQueries({ queryKey: balanceKeys.trip(tripId) });
        queryClient.invalidateQueries({ queryKey: balanceKeys.me(tripId) });
      }
    },
  });
}

interface DeletePaymentContext {
  previousPayments: Payment[] | undefined;
  tripId: string | undefined;
}

/**
 * Hook for soft-deleting a payment with optimistic updates
 */
export function useDeletePayment() {
  const queryClient = useQueryClient();

  return useMutation<void, APIError, string, DeletePaymentContext>({
    mutationKey: ["payments", "delete"],
    mutationFn: async (paymentId: string) => {
      await apiRequest(`/payments/${paymentId}`, {
        method: "DELETE",
      });
    },

    onMutate: async (paymentId) => {
      await queryClient.cancelQueries({ queryKey: paymentKeys.lists() });

      let previousPayments: Payment[] | undefined;
      let tripId: string | undefined;

      const listQueries = queryClient.getQueriesData<Payment[]>({
        queryKey: paymentKeys.lists(),
      });
      for (const [key, list] of listQueries) {
        const found = list?.find((p) => p.id === paymentId);
        if (found) {
          tripId = found.tripId;
          previousPayments = list;
          queryClient.setQueryData<Payment[]>(
            key,
            list!.filter((p) => p.id !== paymentId),
          );
          break;
        }
      }

      return { previousPayments, tripId };
    },

    onSuccess: () => {
      toast.success("Expense deleted");
    },

    onError: (_error, _paymentId, context) => {
      if (context?.previousPayments && context.tripId) {
        queryClient.setQueryData(
          paymentKeys.list(context.tripId),
          context.previousPayments,
        );
      }
    },

    onSettled: (_data, _error, _paymentId, context) => {
      if (context?.tripId) {
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

interface RestorePaymentContext {
  previousPayments: Payment[] | undefined;
  tripId: string | undefined;
}

/**
 * Hook for restoring a soft-deleted payment
 */
export function useRestorePayment() {
  const queryClient = useQueryClient();

  return useMutation<Payment, APIError, string, RestorePaymentContext>({
    mutationKey: ["payments", "restore"],
    mutationFn: async (paymentId: string) => {
      const response = await apiRequest<PaymentResponse>(
        `/payments/${paymentId}/restore`,
        { method: "POST" },
      );
      return response.payment;
    },

    onMutate: async (paymentId) => {
      await queryClient.cancelQueries({ queryKey: paymentKeys.lists() });

      let previousPayments: Payment[] | undefined;
      let tripId: string | undefined;

      const listQueries = queryClient.getQueriesData<Payment[]>({
        queryKey: paymentKeys.lists(),
      });
      for (const [, list] of listQueries) {
        const found = list?.find((p) => p.id === paymentId);
        if (found) {
          tripId = found.tripId;
          previousPayments = list;
          break;
        }
      }

      return { previousPayments, tripId };
    },

    onSuccess: () => {
      toast.success("Expense restored");
    },

    onError: (_error, _paymentId, context) => {
      if (context?.previousPayments && context.tripId) {
        queryClient.setQueryData(
          paymentKeys.list(context.tripId),
          context.previousPayments,
        );
      }
    },

    onSettled: (data, _error, _paymentId, context) => {
      const tripId = data?.tripId ?? context?.tripId;
      if (tripId) {
        queryClient.invalidateQueries({
          queryKey: paymentKeys.list(tripId),
        });
        queryClient.invalidateQueries({
          queryKey: balanceKeys.trip(tripId),
        });
        queryClient.invalidateQueries({
          queryKey: balanceKeys.me(tripId),
        });
      }
    },
  });
}

/**
 * Get user-friendly error message from payment mutation error
 */
export function getPaymentErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to modify this expense.";
      case "NOT_FOUND":
        return "Expense not found.";
      case "VALIDATION_ERROR":
        return "Please check your input and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to manage expenses.";
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
