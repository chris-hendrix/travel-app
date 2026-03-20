// Notification types for the Journiful platform

/**
 * Supported notification types
 */
export type NotificationType =
  | "daily_itinerary"
  | "trip_message"
  | "trip_update"
  | "mutual_invite"
  | "sms_invite";

/**
 * Notification entity as returned by the API
 */
export interface Notification {
  id: string;
  userId: string;
  tripId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * User notification preference settings
 */
export interface NotificationPreferences {
  dailyItinerary: boolean;
  tripMessages: boolean;
}

/**
 * API response for fetching paginated notifications (cursor-based)
 */
export interface GetNotificationsResponse {
  success: true;
  notifications: Notification[];
  meta: {
    total: number;
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  unreadCount: number;
}

/**
 * API response for fetching unread notification count
 */
export interface GetUnreadCountResponse {
  success: true;
  count: number;
}

/**
 * API response for fetching notification preferences
 */
export interface GetNotificationPreferencesResponse {
  success: true;
  preferences: NotificationPreferences;
}

/**
 * API response for updating notification preferences
 */
export interface UpdateNotificationPreferencesResponse {
  success: true;
  preferences: NotificationPreferences;
}
