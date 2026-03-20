import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
} from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type {
  GetMessagesResponse,
  GetMessageCountResponse,
  GetLatestMessageResponse,
} from "@journiful/shared/types";

/**
 * Query key factory for message-related queries
 */
export const messageKeys = {
  all: ["messages"] as const,
  lists: () => ["messages", "list"] as const,
  list: (tripId: string) => ["messages", "list", tripId] as const,
  count: (tripId: string) => ["messages", "count", tripId] as const,
  latest: (tripId: string) => ["messages", "latest", tripId] as const,
  create: () => ["messages", "create"] as const,
  update: () => ["messages", "update"] as const,
  delete: () => ["messages", "delete"] as const,
  pin: () => ["messages", "pin"] as const,
  reaction: () => ["messages", "reaction"] as const,
  mute: () => ["messages", "mute"] as const,
  unmute: () => ["messages", "unmute"] as const,
};

/**
 * Infinite query options for fetching paginated messages for a trip (cursor-based)
 */
export const messagesQueryOptions = (tripId: string) =>
  infiniteQueryOptions({
    queryKey: messageKeys.list(tripId),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: GetMessagesResponse) =>
      lastPage.meta.nextCursor ?? undefined,
    queryFn: async ({ signal, pageParam }) => {
      const searchParams = new URLSearchParams();
      searchParams.set("limit", "20");
      if (pageParam) searchParams.set("cursor", pageParam);

      const query = searchParams.toString();
      const url = `/trips/${tripId}/messages?${query}`;

      return apiRequest<GetMessagesResponse>(url, { signal });
    },
  });

/**
 * Query options for fetching the message count for a trip
 */
export const messageCountQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: messageKeys.count(tripId),
    staleTime: 30 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetMessageCountResponse>(
        `/trips/${tripId}/messages/count`,
        { signal },
      );
      return response.count;
    },
  });

/**
 * Query options for fetching the latest message for a trip
 */
export const latestMessageQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: messageKeys.latest(tripId),
    staleTime: 30 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetLatestMessageResponse>(
        `/trips/${tripId}/messages/latest`,
        { signal },
      );
      return response.message;
    },
  });
