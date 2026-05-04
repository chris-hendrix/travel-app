"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { discoverKeys, discoverQueryOptions } from "./discover-queries";

// Re-export for backward compatibility
export { discoverKeys, discoverQueryOptions };

/**
 * Hook for fetching POI suggestions for a trip
 *
 * Features:
 * - Automatic caching: Results are cached with ["discover", tripId] key
 * - Returns POI suggestions grouped by category
 * - Supports optional refresh param to force re-fetch from Foursquare
 *
 * @param tripId - The ID of the trip to fetch POI suggestions for
 * @param refresh - Whether to force a refresh from the upstream API
 * @returns Query object with data, loading, and error state
 */
export function useDiscover(tripId: string, refresh = false) {
  return useQuery({
    ...discoverQueryOptions(tripId, refresh),
    enabled: !!tripId,
  });
}

/**
 * Hook for manually refreshing the discover cache
 *
 * Invalidates the existing query and triggers a new fetch with refresh=true.
 *
 * @param tripId - The ID of the trip to refresh suggestions for
 * @returns An object with a refresh function
 */
export function useRefreshDiscover(tripId: string) {
  const queryClient = useQueryClient();

  return {
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: discoverKeys.trip(tripId) });
      // Also fetch with refresh=true to bypass server cache
      return queryClient.fetchQuery(discoverQueryOptions(tripId, true));
    },
  };
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
