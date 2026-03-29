import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type {
  GetBalancesResponse,
  GetMyBalanceResponse,
} from "@journiful/shared/types";

/**
 * Query key factory for balance-related queries
 */
export const balanceKeys = {
  all: ["balances"] as const,
  trip: (tripId: string) => ["balances", "trip", tripId] as const,
  me: (tripId: string) => ["balances", "me", tripId] as const,
};

/**
 * Query options for fetching simplified balances for a trip
 */
export const tripBalancesQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: balanceKeys.trip(tripId),
    staleTime: 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetBalancesResponse>(
        `/trips/${tripId}/balances`,
        { signal },
      );
      return response.balances;
    },
  });

/**
 * Query options for fetching the current user's net balance for a trip
 */
export const myBalanceQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: balanceKeys.me(tripId),
    staleTime: 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetMyBalanceResponse>(
        `/trips/${tripId}/balances/me`,
        { signal },
      );
      return response;
    },
  });
