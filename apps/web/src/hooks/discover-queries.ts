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
export function discoverQueryOptions(
  tripId: string,
  lat: number | null,
  lon: number | null,
  location?: string,
  refresh = false,
) {
  return queryOptions({
    queryKey: [...discoverKeys.trip(tripId), { lat, lon, refresh }],
    staleTime: 5 * 60 * 1000, // 5 min (server caches for 7 days)
    enabled: !!tripId && lat != null && lon != null,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (lat != null) params.set("lat", lat.toString());
      if (lon != null) params.set("lon", lon.toString());
      if (location) params.set("location", location);
      if (refresh) params.set("refresh", "true");
      const response = await apiRequest<{
        success: true;
        data: POISuggestionsResponse;
      }>(`/trips/${tripId}/discover?${params}`, { signal });
      return response.data;
    },
  });
}
