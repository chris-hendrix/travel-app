import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
} from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type {
  GetTripsResponse,
  GetTripResponse,
  TripDetail,
} from "@journiful/shared/types";

/**
 * Extended trip detail with metadata from the API response envelope
 */
export interface TripDetailWithMeta extends TripDetail {
  /** Whether this is a preview response for non-Going members */
  isPreview: boolean;
  /** Current user's RSVP status */
  userRsvpStatus: "going" | "not_going" | "maybe" | "no_response";
  /** Whether current user is an organizer */
  isOrganizer: boolean;
}

/**
 * Query key factory for trip-related queries
 */
export const tripKeys = {
  all: ["trips"] as const,
  detail: (id: string) => ["trips", id] as const,
  create: () => ["trips", "create"] as const,
  update: () => ["trips", "update"] as const,
  cancel: () => ["trips", "cancel"] as const,
};

/**
 * Infinite query options for fetching all trips (cursor-based pagination)
 */
export const tripsQueryOptions = infiniteQueryOptions({
  queryKey: tripKeys.all,
  staleTime: 2 * 60 * 1000,
  placeholderData: keepPreviousData,
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage: GetTripsResponse) =>
    lastPage.meta.nextCursor ?? undefined,
  queryFn: async ({ signal, pageParam }) => {
    const searchParams = new URLSearchParams();
    if (pageParam) searchParams.set("cursor", pageParam);
    searchParams.set("limit", "20");

    const query = searchParams.toString();
    const url = query ? `/trips?${query}` : "/trips";

    return apiRequest<GetTripsResponse>(url, { signal });
  },
});

/**
 * Query options factory for fetching a single trip's details
 */
export const tripDetailQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: tripKeys.detail(tripId),
    staleTime: 2 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetTripResponse>(`/trips/${tripId}`, {
        signal,
      });
      const result: TripDetailWithMeta = {
        ...response.trip,
        isPreview: response.isPreview ?? false,
        userRsvpStatus: response.userRsvpStatus ?? "going",
        isOrganizer: response.isOrganizer ?? false,
      };
      return result;
    },
  });
