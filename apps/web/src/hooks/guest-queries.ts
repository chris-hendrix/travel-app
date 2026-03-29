import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { GetGuestsResponse } from "@journiful/shared/types";

/**
 * Query key factory for guest-related queries
 */
export const guestKeys = {
  all: ["guests"] as const,
  lists: () => ["guests", "list"] as const,
  list: (tripId: string) => ["guests", "list", tripId] as const,
};

/**
 * Query options for fetching all guests for a trip
 */
export const guestsQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: guestKeys.list(tripId),
    staleTime: 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetGuestsResponse>(
        `/trips/${tripId}/guests`,
        { signal },
      );
      return response.guests;
    },
  });
