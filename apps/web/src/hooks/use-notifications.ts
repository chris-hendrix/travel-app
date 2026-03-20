"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { apiRequest, APIError } from "@/lib/api";

const POLLING_ENABLED = process.env.NEXT_PUBLIC_ENABLE_POLLING !== "false";
import type { NotificationPreferencesInput } from "@journiful/shared/schemas";
import type {
  GetNotificationsResponse,
  Notification,
  NotificationPreferences,
  UpdateNotificationPreferencesResponse,
} from "@journiful/shared/types";

// Import query keys and options from server-safe module for use in hooks
import {
  notificationKeys,
  notificationsQueryOptions,
  unreadCountQueryOptions,
  tripUnreadCountQueryOptions,
  notificationPreferencesQueryOptions,
} from "./notification-queries";

// Re-export for backward compatibility
export {
  notificationKeys,
  notificationsQueryOptions,
  unreadCountQueryOptions,
  tripUnreadCountQueryOptions,
  notificationPreferencesQueryOptions,
};

// Re-export types for backward compatibility with existing imports
export type { Notification, NotificationPreferences };
export type { NotificationType } from "@journiful/shared/types";

// ---------------------------------------------------------------------------
// Query Hooks
// ---------------------------------------------------------------------------

/**
 * Hook for fetching the global unread notification count
 *
 * Features:
 * - Polling: Refetches every 30 seconds
 * - Useful for badge/indicator displays in the app header
 *
 * @returns Query object with unread count data
 */
export function useUnreadCount() {
  return useQuery({
    ...unreadCountQueryOptions(),
    refetchInterval: POLLING_ENABLED ? 30000 : false,
  });
}

/**
 * Hook for fetching the unread notification count for a specific trip
 *
 * Features:
 * - Polling: Refetches every 30 seconds
 * - Useful for trip-specific notification badges
 *
 * @param tripId - The ID of the trip
 * @returns Query object with trip-specific unread count data
 */
export function useTripUnreadCount(tripId: string) {
  return useQuery({
    ...tripUnreadCountQueryOptions(tripId),
    refetchInterval: POLLING_ENABLED ? 30000 : false,
    enabled: !!tripId,
  });
}

/**
 * Hook for fetching paginated notifications
 *
 * Features:
 * - Supports global or trip-specific notifications
 * - Returns full response with notifications, pagination meta, and unreadCount
 * - No polling: user navigates to see notifications
 *
 * @param options - Optional filter parameters (tripId, limit, unreadOnly)
 * @returns Query object with notifications data and pagination info
 */
export function useNotifications(options?: {
  tripId?: string;
  unreadOnly?: boolean;
}) {
  return useInfiniteQuery({
    ...notificationsQueryOptions(options),
  });
}

/**
 * Hook for fetching notification preferences for a specific trip
 *
 * @param tripId - The ID of the trip
 * @returns Query object with notification preferences data
 */
export function useNotificationPreferences(tripId: string) {
  return useQuery({
    ...notificationPreferencesQueryOptions(tripId),
    enabled: !!tripId,
  });
}

// ---------------------------------------------------------------------------
// Mark As Read
// ---------------------------------------------------------------------------

/**
 * Context type for mark as read mutation callbacks
 * Contains previous state for rollback on error
 */
interface MarkAsReadContext {
  previousUnreadCount: number | undefined;
  previousLists: Map<string, InfiniteData<GetNotificationsResponse>>;
  tripId: string | null;
}

/**
 * Hook for marking a single notification as read with optimistic updates
 *
 * Features:
 * - Optimistic updates: Decrements unread count and sets readAt immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Cross-query invalidation: Updates all notification lists and unread counts
 *
 * @returns Mutation object with mutate function and state
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation<{ success: true }, APIError, string, MarkAsReadContext>({
    mutationKey: notificationKeys.markRead(),
    mutationFn: async (notificationId: string) => {
      return await apiRequest<{ success: true }>(
        `/notifications/${notificationId}/read`,
        {
          method: "PATCH",
        },
      );
    },

    // Optimistic update: Decrement unread count and set readAt on notification
    onMutate: async (notificationId) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({
        queryKey: notificationKeys.unreadCount(),
      });
      await queryClient.cancelQueries({
        queryKey: notificationKeys.lists(),
      });

      // Snapshot the previous unread count
      const previousUnreadCount = queryClient.getQueryData<number>(
        notificationKeys.unreadCount(),
      );

      // Snapshot all notification list queries (InfiniteData shape)
      const previousLists = new Map<
        string,
        InfiniteData<GetNotificationsResponse>
      >();
      const listQueries = queryClient.getQueriesData<
        InfiniteData<GetNotificationsResponse>
      >({
        queryKey: notificationKeys.lists(),
      });
      for (const [key, data] of listQueries) {
        if (data) {
          previousLists.set(JSON.stringify(key), data);
        }
      }

      // Find the tripId of the notification being marked as read
      let tripId: string | null = null;
      for (const [, data] of listQueries) {
        if (data) {
          for (const page of data.pages) {
            const notification = page.notifications.find(
              (n: Notification) => n.id === notificationId,
            );
            if (notification) {
              tripId = notification.tripId;
              break;
            }
          }
          if (tripId) break;
        }
      }

      // Optimistically decrement unread count
      if (previousUnreadCount !== undefined && previousUnreadCount > 0) {
        queryClient.setQueryData<number>(
          notificationKeys.unreadCount(),
          previousUnreadCount - 1,
        );
      }

      // Optimistically set readAt on matching notification in all list caches
      const now = new Date().toISOString();
      for (const [key, data] of listQueries) {
        if (data) {
          queryClient.setQueryData<InfiniteData<GetNotificationsResponse>>(
            key,
            {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                unreadCount: Math.max(0, page.unreadCount - 1),
                notifications: page.notifications.map(
                  (notification: Notification) =>
                    notification.id === notificationId
                      ? { ...notification, readAt: now }
                      : notification,
                ),
              })),
            },
          );
        }
      }

      return { previousUnreadCount, previousLists, tripId };
    },

    // On error: Rollback optimistic update
    onError: (_error, _notificationId, context) => {
      if (context?.previousUnreadCount !== undefined) {
        queryClient.setQueryData(
          notificationKeys.unreadCount(),
          context.previousUnreadCount,
        );
      }
      if (context?.previousLists) {
        for (const [keyStr, data] of context.previousLists) {
          queryClient.setQueryData(JSON.parse(keyStr), data);
        }
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    onSettled: (_data, _error, _notificationId, onMutateResult) => {
      queryClient.invalidateQueries({
        queryKey: notificationKeys.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount(),
      });
      if (onMutateResult?.tripId) {
        queryClient.invalidateQueries({
          queryKey: notificationKeys.tripUnreadCount(onMutateResult.tripId),
        });
      }
    },
  });
}

/**
 * Get user-friendly error message from mark as read mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message or null if no error
 */
export function getMarkAsReadErrorMessage(error: Error | null): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "NOTIFICATION_NOT_FOUND":
        return "Notification not found.";
      case "UNAUTHORIZED":
        return "You must be logged in to mark notifications as read.";
      default:
        return error.message;
    }
  }

  // Network errors or other generic errors
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

// ---------------------------------------------------------------------------
// Mark All As Read
// ---------------------------------------------------------------------------

/**
 * Context type for mark all as read mutation callbacks
 * Contains previous state for rollback on error
 */
interface MarkAllAsReadContext {
  previousUnreadCount: number | undefined;
  previousTripUnreadCount: number | undefined;
  previousLists: Map<string, InfiniteData<GetNotificationsResponse>>;
}

/**
 * Hook for marking all notifications as read with optimistic updates
 *
 * Features:
 * - Supports global or trip-specific mark all as read
 * - Optimistic updates: Sets unread count to 0 and readAt on all notifications
 * - Error rollback: Reverts optimistic update on failure
 * - Cross-query invalidation: Updates all notification lists and unread counts
 *
 * @returns Mutation object with mutate function and state
 */
export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: true },
    APIError,
    { tripId?: string } | undefined,
    MarkAllAsReadContext
  >({
    mutationKey: notificationKeys.markAllRead(),
    mutationFn: async (params?: { tripId?: string }) => {
      return await apiRequest<{ success: true }>(`/notifications/read-all`, {
        method: "PATCH",
        ...(params?.tripId
          ? { body: JSON.stringify({ tripId: params.tripId }) }
          : {}),
      });
    },

    // Optimistic update: Set all unread counts to 0, mark all as read
    onMutate: async (params) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: notificationKeys.unreadCount(),
      });
      await queryClient.cancelQueries({
        queryKey: notificationKeys.lists(),
      });

      // Snapshot the previous values
      const previousUnreadCount = queryClient.getQueryData<number>(
        notificationKeys.unreadCount(),
      );

      let previousTripUnreadCount: number | undefined;
      if (params?.tripId) {
        await queryClient.cancelQueries({
          queryKey: notificationKeys.tripUnreadCount(params.tripId),
        });
        previousTripUnreadCount = queryClient.getQueryData<number>(
          notificationKeys.tripUnreadCount(params.tripId),
        );
      }

      // Snapshot all notification list queries (InfiniteData shape)
      const previousLists = new Map<
        string,
        InfiniteData<GetNotificationsResponse>
      >();
      const listQueries = queryClient.getQueriesData<
        InfiniteData<GetNotificationsResponse>
      >({
        queryKey: notificationKeys.lists(),
      });
      for (const [key, data] of listQueries) {
        if (data) {
          previousLists.set(JSON.stringify(key), data);
        }
      }

      // Optimistically set unread count to 0
      if (params?.tripId) {
        queryClient.setQueryData<number>(
          notificationKeys.tripUnreadCount(params.tripId),
          0,
        );
        // Also update global count: subtract trip unread from global
        const globalCount =
          queryClient.getQueryData<number>(notificationKeys.unreadCount()) ?? 0;
        const tripCount = previousTripUnreadCount ?? 0;
        queryClient.setQueryData<number>(
          notificationKeys.unreadCount(),
          Math.max(0, globalCount - tripCount),
        );
      } else {
        queryClient.setQueryData<number>(notificationKeys.unreadCount(), 0);
      }

      // Optimistically set readAt on all unread notifications in list caches
      const now = new Date().toISOString();
      for (const [key, data] of listQueries) {
        if (data) {
          queryClient.setQueryData<InfiniteData<GetNotificationsResponse>>(
            key,
            {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                unreadCount: 0,
                notifications: page.notifications.map(
                  (notification: Notification) =>
                    notification.readAt === null
                      ? { ...notification, readAt: now }
                      : notification,
                ),
              })),
            },
          );
        }
      }

      return { previousUnreadCount, previousTripUnreadCount, previousLists };
    },

    // On error: Rollback optimistic update
    onError: (_error, params, context) => {
      if (context?.previousUnreadCount !== undefined) {
        queryClient.setQueryData(
          notificationKeys.unreadCount(),
          context.previousUnreadCount,
        );
      }
      if (params?.tripId && context?.previousTripUnreadCount !== undefined) {
        queryClient.setQueryData(
          notificationKeys.tripUnreadCount(params.tripId),
          context.previousTripUnreadCount,
        );
      }
      if (context?.previousLists) {
        for (const [keyStr, data] of context.previousLists) {
          queryClient.setQueryData(JSON.parse(keyStr), data);
        }
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    onSettled: (_data, _error, params) => {
      queryClient.invalidateQueries({
        queryKey: notificationKeys.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount(),
      });
      if (params?.tripId) {
        queryClient.invalidateQueries({
          queryKey: notificationKeys.tripUnreadCount(params.tripId),
        });
      }
    },
  });
}

/**
 * Get user-friendly error message from mark all as read mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message or null if no error
 */
export function getMarkAllAsReadErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "UNAUTHORIZED":
        return "You must be logged in to mark notifications as read.";
      default:
        return error.message;
    }
  }

  // Network errors or other generic errors
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

// ---------------------------------------------------------------------------
// Update Notification Preferences
// ---------------------------------------------------------------------------

/**
 * Context type for update preferences mutation callbacks
 * Contains previous state for rollback on error
 */
interface UpdatePreferencesContext {
  previousPreferences: NotificationPreferences | undefined;
}

/**
 * Hook for updating notification preferences with optimistic updates
 *
 * Features:
 * - Optimistic updates: Sets preferences in cache immediately
 * - Error rollback: Reverts optimistic update on failure
 * - Cache invalidation: Refreshes preferences on settle
 *
 * @param tripId - The ID of the trip to update preferences for
 * @returns Mutation object with mutate function and state
 */
export function useUpdateNotificationPreferences(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    UpdateNotificationPreferencesResponse,
    APIError,
    NotificationPreferencesInput,
    UpdatePreferencesContext
  >({
    mutationKey: notificationKeys.updatePreferences(),
    mutationFn: async (data) => {
      const response = await apiRequest<UpdateNotificationPreferencesResponse>(
        `/trips/${tripId}/notification-preferences`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        },
      );
      return response;
    },

    // Optimistic update: Set preferences in cache immediately
    onMutate: async (data) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: notificationKeys.preferences(tripId),
      });

      // Snapshot the previous preferences
      const previousPreferences =
        queryClient.getQueryData<NotificationPreferences>(
          notificationKeys.preferences(tripId),
        );

      // Optimistically set preferences to new values
      queryClient.setQueryData<NotificationPreferences>(
        notificationKeys.preferences(tripId),
        {
          dailyItinerary: data.dailyItinerary,
          tripMessages: data.tripMessages,
        },
      );

      return { previousPreferences };
    },

    // On error: Rollback optimistic update
    onError: (_error, _data, context) => {
      if (context?.previousPreferences) {
        queryClient.setQueryData(
          notificationKeys.preferences(tripId),
          context.previousPreferences,
        );
      }
    },

    // Always invalidate queries after mutation settles (success or error)
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: notificationKeys.preferences(tripId),
      });
    },
  });
}

/**
 * Get user-friendly error message from update preferences mutation error
 *
 * @param error - Error from mutation
 * @returns User-friendly error message or null if no error
 */
export function getUpdatePreferencesErrorMessage(
  error: Error | null,
): string | null {
  if (!error) return null;

  if (error instanceof APIError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "You don't have permission to update notification preferences for this trip.";
      case "VALIDATION_ERROR":
        return "Please check your preferences and try again.";
      case "UNAUTHORIZED":
        return "You must be logged in to update notification preferences.";
      default:
        return error.message;
    }
  }

  // Network errors or other generic errors
  if (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.toLowerCase().includes("failed to fetch")
  ) {
    return "Network error: Please check your connection and try again.";
  }

  return "An unexpected error occurred. Please try again.";
}
