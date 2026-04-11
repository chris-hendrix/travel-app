import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { SuggestionsResponse } from "@journiful/shared/types";

/**
 * Query key factory for suggestion-related queries
 */
export const suggestionKeys = {
  all: ["suggestions"] as const,
  lists: () => ["suggestions", "list"] as const,
  list: (tripId: string) => ["suggestions", "list", tripId] as const,
};

/**
 * Query options for fetching suggestions for a trip
 */
export const suggestionsQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: suggestionKeys.list(tripId),
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<SuggestionsResponse>(
        `/trips/${tripId}/suggestions`,
        { signal },
      );
      return response.suggestions;
    },
  });
