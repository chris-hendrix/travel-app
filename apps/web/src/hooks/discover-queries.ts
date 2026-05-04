import { queryOptions } from "@tanstack/react-query";
import type { POISuggestionsResponse } from "@journiful/shared/types";
import { apiRequest } from "@/lib/api";

/**
 * Query key factory for discover-related queries
 */
export const discoverKeys = {
  all: ["discover"] as const,
  trip: (tripId: string) => ["discover", tripId] as const,
};

/**
 * Query options factory for fetching POI suggestions for a trip
 *
 * Server caches results for 7 days; client considers 5-minute stale time.
 * Pass refresh=true to force an upstream Foursquare fetch.
 */
export function discoverQueryOptions(tripId: string, refresh = false) {
  return queryOptions({
    queryKey: [...discoverKeys.trip(tripId), { refresh }],
    staleTime: 5 * 60 * 1000, // 5 min (server caches for 7 days)
    enabled: !!tripId,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<{
        success: true;
        data: POISuggestionsResponse;
      }>(`/trips/${tripId}/discover?refresh=${refresh}`, { signal });
      return response.data;
    },
  });
}
