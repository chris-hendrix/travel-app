import { queryOptions } from "@tanstack/react-query";
import type { TripWeatherResponse } from "@journiful/shared/types";
import { apiRequest } from "@/lib/api";

/**
 * Query key factory for weather-related queries
 */
export const weatherKeys = {
  all: ["weather"] as const,
  forecast: (tripId: string) => ["weather", "forecast", tripId] as const,
};

/**
 * Query options for fetching weather forecast for a trip
 */
export function weatherForecastQueryOptions(tripId: string) {
  return queryOptions({
    queryKey: weatherKeys.forecast(tripId),
    staleTime: 30 * 60 * 1000, // 30 min client-side (server caches 3h)
    enabled: !!tripId,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<{
        success: true;
        weather: TripWeatherResponse;
      }>(`/trips/${tripId}/weather`, { signal });
      return response.weather;
    },
  });
}
