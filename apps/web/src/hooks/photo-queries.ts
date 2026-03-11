import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { GetPhotosResponse } from "@tripful/shared/types";

/**
 * Query key factory for photo-related queries
 */
export const photoKeys = {
  all: (tripId: string) => ["trips", tripId, "photos"] as const,
  upload: (tripId: string) => ["trips", tripId, "photos", "upload"] as const,
  update: (tripId: string) => ["trips", tripId, "photos", "update"] as const,
  delete: (tripId: string) => ["trips", tripId, "photos", "delete"] as const,
};

/**
 * Query options for fetching all photos for a trip
 */
export const photosQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: photoKeys.all(tripId),
    staleTime: 30 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetPhotosResponse>(
        `/trips/${tripId}/photos`,
        { signal },
      );
      return response.photos;
    },
  });
