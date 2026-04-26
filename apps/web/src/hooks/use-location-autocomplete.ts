"use client";

import { useState, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export interface LocationSuggestion {
  placeId: string;
  displayName: string;
  displayPlace: string;
  displayAddress: string;
  lat: number;
  lon: number;
}

function useDebounce(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export function useLocationAutocomplete(
  query: string,
  context?: { lat: number; lon: number } | null,
) {
  const debouncedQuery = useDebounce(query, 300);

  return useQuery<LocationSuggestion[]>({
    queryKey: ["locations", "autocomplete", debouncedQuery, context?.lat, context?.lon],
    queryFn: () => {
      const params = new URLSearchParams({ q: debouncedQuery });
      if (context?.lat != null) params.set("lat", String(context.lat));
      if (context?.lon != null) params.set("lon", String(context.lon));
      return apiRequest<LocationSuggestion[]>(`/locations/autocomplete?${params}`);
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
