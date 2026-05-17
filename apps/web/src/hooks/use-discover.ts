"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { discoverKeys, discoverQueryOptions } from "./discover-queries";

// Re-export for backward compatibility
export { discoverKeys };

/**
 * Hook for fetching POI suggestions for a trip
 *
 * Features:
 * - Automatic caching: Results are cached with ["discover", tripId] key
 * - Returns POI suggestions grouped by category
 * - Changing lat/lon triggers re-fetch via the query key
 *
 * @param tripId - The ID of the trip to fetch POI suggestions for
 * @param lat - Latitude for the search center
 * @param lon - Longitude for the search center
 * @param location - Optional location name
 * @returns Query object with data, loading, and error state
 */
export function useDiscover(
  tripId: string,
  lat: number | null,
  lon: number | null,
  location?: string,
) {
  return useQuery({
    ...discoverQueryOptions(tripId, lat, lon, location),
    enabled: !!tripId && lat != null && lon != null,
  });
}

/**
 * Hook for converting a POI suggestion into a trip event
 *
 * PATCH /trips/:tripId/discover/convert
 * Marks the POI as converted and invalidates the discover query
 * so the converted POI is no longer shown.
 *
 * @param tripId - The ID of the trip
 * @returns Mutation object with mutate function and state
 */
export function useConvertPOI(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...discoverKeys.trip(tripId), "convert"],
    mutationFn: async ({
      sourceId,
      eventId,
    }: {
      sourceId: string;
      eventId: string;
    }) => {
      await apiRequest(`/trips/${tripId}/discover/convert`, {
        method: "PATCH",
        body: JSON.stringify({ sourceId, eventId }),
      });
    },
    onSuccess: () => {
      // Invalidate discover query to hide the converted POI
      queryClient.invalidateQueries({ queryKey: discoverKeys.trip(tripId) });
    },
  });
}
