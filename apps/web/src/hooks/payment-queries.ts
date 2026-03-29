import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { GetPaymentsResponse } from "@journiful/shared/types";

/**
 * Query key factory for payment-related queries
 */
export const paymentKeys = {
  all: ["payments"] as const,
  lists: () => ["payments", "list"] as const,
  list: (tripId: string) => ["payments", "list", tripId] as const,
};

/**
 * Query options for fetching all payments for a trip
 */
export const paymentsQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: paymentKeys.list(tripId),
    staleTime: 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetPaymentsResponse>(
        `/trips/${tripId}/payments`,
        { signal },
      );
      return response.payments;
    },
  });
