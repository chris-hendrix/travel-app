import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type {
  GetAccommodationsResponse,
  GetAccommodationResponse,
} from "@journiful/shared/types";

/**
 * Query key factory for accommodation-related queries
 */
export const accommodationKeys = {
  all: ["accommodations"] as const,
  lists: () => ["accommodations", "list"] as const,
  list: (tripId: string) => ["accommodations", "list", tripId] as const,
  details: () => ["accommodations", "detail"] as const,
  detail: (id: string) => ["accommodations", "detail", id] as const,
  create: () => ["accommodations", "create"] as const,
  update: () => ["accommodations", "update"] as const,
  delete: () => ["accommodations", "delete"] as const,
  restore: () => ["accommodations", "restore"] as const,
};

/**
 * Query options for fetching all accommodations for a trip
 */
export const accommodationsQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: accommodationKeys.list(tripId),
    staleTime: 2 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetAccommodationsResponse>(
        `/trips/${tripId}/accommodations`,
        { signal },
      );
      return response.accommodations;
    },
  });

/**
 * Query options for fetching all accommodations for a trip, including soft-deleted ones
 */
export const accommodationsWithDeletedQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: [...accommodationKeys.list(tripId), "withDeleted"] as const,
    staleTime: 2 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetAccommodationsResponse>(
        `/trips/${tripId}/accommodations?includeDeleted=true`,
        { signal },
      );
      return response.accommodations;
    },
  });

/**
 * Query options factory for fetching a single accommodation's details
 */
export const accommodationDetailQueryOptions = (accommodationId: string) =>
  queryOptions({
    queryKey: accommodationKeys.detail(accommodationId),
    staleTime: 2 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetAccommodationResponse>(
        `/accommodations/${accommodationId}`,
        {
          signal,
        },
      );
      return response.accommodation;
    },
  });
