import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type {
  GetMemberTravelsResponse,
  GetMemberTravelResponse,
} from "@journiful/shared/types";

/**
 * Query key factory for member travel-related queries
 */
export const memberTravelKeys = {
  all: ["memberTravels"] as const,
  lists: () => ["memberTravels", "list"] as const,
  list: (tripId: string) => ["memberTravels", "list", tripId] as const,
  details: () => ["memberTravels", "detail"] as const,
  detail: (id: string) => ["memberTravels", "detail", id] as const,
  create: () => ["memberTravels", "create"] as const,
  update: () => ["memberTravels", "update"] as const,
  delete: () => ["memberTravels", "delete"] as const,
  restore: () => ["memberTravels", "restore"] as const,
};

/**
 * Query options for fetching all member travels for a trip
 */
export const memberTravelsQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: memberTravelKeys.list(tripId),
    staleTime: 2 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetMemberTravelsResponse>(
        `/trips/${tripId}/member-travel`,
        { signal },
      );
      return response.memberTravels;
    },
  });

/**
 * Query options for fetching all member travels for a trip, including soft-deleted ones
 */
export const memberTravelsWithDeletedQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: [...memberTravelKeys.list(tripId), "withDeleted"] as const,
    staleTime: 2 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetMemberTravelsResponse>(
        `/trips/${tripId}/member-travel?includeDeleted=true`,
        { signal },
      );
      return response.memberTravels;
    },
  });

/**
 * Query options factory for fetching a single member travel's details
 */
export const memberTravelDetailQueryOptions = (memberTravelId: string) =>
  queryOptions({
    queryKey: memberTravelKeys.detail(memberTravelId),
    staleTime: 2 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetMemberTravelResponse>(
        `/member-travel/${memberTravelId}`,
        {
          signal,
        },
      );
      return response.memberTravel;
    },
  });
