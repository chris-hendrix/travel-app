"use client";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

interface LocationDetailsParams {
  placeId: string;
  sessionToken: string;
}

export interface LocationSuggestion {
  placeId: string;
  shortName: string;
  displayName: string;
  displayPlace: string;
  displayAddress: string;
  lat: number;
  lon: number;
}

export function useLocationDetails() {
  return useMutation<LocationSuggestion, Error, LocationDetailsParams>({
    mutationFn: ({ placeId, sessionToken }) => {
      const params = new URLSearchParams({ placeId, sessionToken });
      return apiRequest<LocationSuggestion>(`/locations/details?${params}`);
    },
  });
}
