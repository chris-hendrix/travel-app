"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export interface LocationSuggestion {
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

export function useLocationAutocomplete(query: string) {
  const debouncedQuery = useDebounce(query, 300);

  return useQuery<LocationSuggestion[]>({
    queryKey: ["locations", "autocomplete", debouncedQuery],
    queryFn: () =>
      apiRequest<LocationSuggestion[]>(
        `/locations/autocomplete?q=${encodeURIComponent(debouncedQuery)}`,
      ),
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}
