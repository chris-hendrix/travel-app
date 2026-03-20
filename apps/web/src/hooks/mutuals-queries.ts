import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { GetMutualsResponse } from "@journiful/shared/types";

/**
 * Query key factory for mutual-related queries
 */
export const mutualKeys = {
  all: ["mutuals"] as const,
  lists: () => ["mutuals", "list"] as const,
  list: (params?: {
    tripId?: string | undefined;
    search?: string | undefined;
  }) => ["mutuals", "list", params] as const,
  suggestions: () => ["mutuals", "suggestions"] as const,
  suggestion: (tripId: string) => ["mutuals", "suggestions", tripId] as const,
};

/**
 * Infinite query options for fetching paginated mutuals
 *
 * Supports optional search and tripId filters.
 * Uses cursor-based pagination with keyset cursors.
 *
 * @param params - Optional filter parameters (search, tripId)
 * @returns Infinite query options for use with useInfiniteQuery
 */
export const mutualsQueryOptions = (params?: {
  tripId?: string | undefined;
  search?: string | undefined;
}) =>
  infiniteQueryOptions({
    queryKey: mutualKeys.list(params),
    staleTime: 2 * 60 * 1000,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: GetMutualsResponse) =>
      lastPage.nextCursor ?? undefined,
    queryFn: async ({ signal, pageParam }) => {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set("search", params.search);
      if (params?.tripId) searchParams.set("tripId", params.tripId);
      if (pageParam) searchParams.set("cursor", pageParam);

      const query = searchParams.toString();
      const url = query ? `/mutuals?${query}` : "/mutuals";

      return apiRequest<GetMutualsResponse>(url, { signal });
    },
  });

/**
 * Query options for fetching mutual suggestions for a trip
 *
 * Returns mutuals who are not yet members of the specified trip.
 * Used in the invite members dialog.
 *
 * @param tripId - The ID of the trip to get suggestions for
 * @returns Query options for use with useQuery
 */
export const mutualSuggestionsQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: mutualKeys.suggestion(tripId),
    staleTime: 2 * 60 * 1000,
    queryFn: async ({ signal }) => {
      return apiRequest<GetMutualsResponse>(
        `/trips/${tripId}/mutual-suggestions`,
        { signal },
      );
    },
  });
