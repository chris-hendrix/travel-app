import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { FlightLookupResponse } from "@journiful/shared/types";

/**
 * Hook for looking up flight information by flight number and date.
 * Uses POST /api/flights/lookup endpoint.
 */
export function useFlightLookup() {
  return useMutation({
    mutationKey: ["flights", "lookup"],
    mutationFn: async ({
      flightNumber,
      date,
    }: {
      flightNumber: string;
      date: string;
    }) => {
      const response = await apiRequest<{
        success: true;
      } & FlightLookupResponse>("/flights/lookup", {
        method: "POST",
        body: JSON.stringify({ flightNumber, date }),
      });
      return response;
    },
  });
}
