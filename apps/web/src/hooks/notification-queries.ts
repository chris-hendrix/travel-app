import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
} from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type {
  GetNotificationsResponse,
  GetUnreadCountResponse,
  GetNotificationPreferencesResponse,
  NotificationPreferences,
} from "@journiful/shared/types";

/**
 * Query key factory for notification-related queries
 */
export const notificationKeys = {
  all: ["notifications"] as const,
  lists: () => ["notifications", "list"] as const,
  list: (params?: { tripId?: string; unreadOnly?: boolean }) =>
    ["notifications", "list", params] as const,
  unreadCount: () => ["notifications", "unread-count"] as const,
  tripUnreadCount: (tripId: string) =>
    ["notifications", "unread-count", tripId] as const,
  preferences: (tripId: string) =>
    ["notifications", "preferences", tripId] as const,
  markRead: () => ["notifications", "mark-read"] as const,
  markAllRead: () => ["notifications", "mark-all-read"] as const,
  updatePreferences: () => ["notifications", "update-preferences"] as const,
};

/**
 * Infinite query options for fetching paginated notifications (cursor-based)
 *
 * If tripId is provided, fetches trip-specific notifications.
 * Otherwise fetches all notifications for the current user.
 *
 * @param params - Optional filter parameters (tripId, unreadOnly)
 * @returns Infinite query options for use with useInfiniteQuery
 */
export const notificationsQueryOptions = (params?: {
  tripId?: string;
  unreadOnly?: boolean;
}) =>
  infiniteQueryOptions({
    queryKey: notificationKeys.list(params),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: GetNotificationsResponse) =>
      lastPage.meta.nextCursor ?? undefined,
    queryFn: async ({ signal, pageParam }) => {
      const searchParams = new URLSearchParams();
      searchParams.set("limit", "20");
      if (pageParam) searchParams.set("cursor", pageParam);
      if (params?.unreadOnly !== undefined)
        searchParams.set("unreadOnly", String(params.unreadOnly));

      const query = searchParams.toString();
      const base = params?.tripId
        ? `/trips/${params.tripId}/notifications`
        : `/notifications`;
      const url = query ? `${base}?${query}` : base;

      const response = await apiRequest<GetNotificationsResponse>(url, {
        signal,
      });
      return response;
    },
  });

/**
 * Query options for fetching the global unread notification count
 *
 * @returns Query options returning the unread count number
 */
export const unreadCountQueryOptions = () =>
  queryOptions({
    queryKey: notificationKeys.unreadCount(),
    staleTime: 30 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetUnreadCountResponse>(
        `/notifications/unread-count`,
        { signal },
      );
      return response.count;
    },
  });

/**
 * Query options for fetching the unread notification count for a specific trip
 *
 * @param tripId - The ID of the trip
 * @returns Query options returning the trip-specific unread count number
 */
export const tripUnreadCountQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: notificationKeys.tripUnreadCount(tripId),
    staleTime: 30 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetUnreadCountResponse>(
        `/trips/${tripId}/notifications/unread-count`,
        { signal },
      );
      return response.count;
    },
  });

/**
 * Query options for fetching notification preferences for a specific trip
 *
 * @param tripId - The ID of the trip
 * @returns Query options returning the notification preferences object
 */
export const notificationPreferencesQueryOptions = (tripId: string) =>
  queryOptions<NotificationPreferences>({
    queryKey: notificationKeys.preferences(tripId),
    staleTime: 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<GetNotificationPreferencesResponse>(
        `/trips/${tripId}/notification-preferences`,
        { signal },
      );
      return response.preferences;
    },
  });
