"use client";

import { useQuery } from "@tanstack/react-query";
import { weatherKeys, weatherForecastQueryOptions } from "./weather-queries";

// Re-export for convenience
export { weatherKeys, weatherForecastQueryOptions };

/**
 * Fetch weather forecast for a trip.
 *
 * @example
 * const { data: weather, isLoading } = useWeatherForecast(tripId);
 */
export function useWeatherForecast(tripId: string) {
  return useQuery({
    ...weatherForecastQueryOptions(tripId),
    enabled: !!tripId,
  });
}
