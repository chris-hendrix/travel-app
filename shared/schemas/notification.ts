// Notification validation schemas for the Journiful platform

import { z } from "zod";

/**
 * Validates notification preference update data
 * - dailyItinerary: boolean (required)
 * - tripMessages: boolean (required)
 */
export const notificationPreferencesSchema = z.object({
  dailyItinerary: z.boolean(),
  tripMessages: z.boolean(),
});

// --- Response schemas ---

/** Notification entity as returned by the API */
const notificationEntitySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tripId: z.string().uuid().nullable(),
  type: z.enum([
    "daily_itinerary",
    "trip_message",
    "trip_update",
    "mutual_invite",
    "sms_invite",
  ]),
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()).nullable(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
});

/** GET /api/notifications - Paginated notification list (cursor-based) */
export const notificationListResponseSchema = z.object({
  success: z.literal(true),
  notifications: z.array(notificationEntitySchema),
  meta: z.object({
    total: z.number(),
    limit: z.number(),
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
  unreadCount: z.number(),
});

/** GET /api/notifications/unread-count - Unread count */
export const unreadCountResponseSchema = z.object({
  success: z.literal(true),
  count: z.number(),
});

/** GET/PUT /api/notifications/preferences - Notification preferences */
export const notificationPreferencesResponseSchema = z.object({
  success: z.literal(true),
  preferences: z.object({
    dailyItinerary: z.boolean(),
    tripMessages: z.boolean(),
  }),
});

// --- Push subscription schemas ---

/** POST /api/push/subscribe - Subscribe to push notifications */
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});

/** DELETE /api/push/subscribe - Unsubscribe from push notifications */
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

/** GET /api/push/vapid-public-key response */
export const vapidPublicKeyResponseSchema = z.object({
  publicKey: z.string(),
});

// Inferred TypeScript types from schemas
export type NotificationPreferencesInput = z.infer<
  typeof notificationPreferencesSchema
>;
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;
