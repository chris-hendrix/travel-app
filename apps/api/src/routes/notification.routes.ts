import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notificationController } from "@/controllers/notification.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import {
  defaultRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import {
  notificationListResponseSchema,
  unreadCountResponseSchema,
  notificationPreferencesResponseSchema,
  notificationPreferencesSchema,
  successResponseSchema,
} from "@journiful/shared/schemas";
import type { NotificationPreferencesInput } from "@journiful/shared/schemas";

// Reusable param schemas
const tripIdParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

const notificationIdParamsSchema = z.object({
  notificationId: z
    .string()
    .uuid({ message: "Invalid notification ID format" }),
});

// Query schemas
const notificationQuerySchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.coerce.boolean().optional().default(false),
});

const globalNotificationQuerySchema = notificationQuerySchema.extend({
  tripId: z.string().uuid().optional(),
});

/**
 * Notification Routes
 * Registers all notification-related endpoints
 *
 * Read-only routes (GET) require authentication only.
 * Mark-as-read routes (PATCH) require authentication with write rate limiting.
 * Preference update routes (PUT) require authentication and complete profile,
 * applied via a scoped plugin with shared preHandler hooks.
 *
 * @param fastify - Fastify instance
 */
export async function notificationRoutes(fastify: FastifyInstance) {
  // --- Read routes ---

  /**
   * GET /notifications
   * List paginated notifications for the authenticated user
   * Requires authentication only
   */
  fastify.get<{
    Querystring: {
      cursor?: string;
      limit: number;
      unreadOnly: boolean;
      tripId?: string;
    };
  }>(
    "/notifications",
    {
      schema: {
        querystring: globalNotificationQuerySchema,
        response: { 200: notificationListResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    notificationController.listNotifications,
  );

  /**
   * GET /notifications/unread-count
   * Get the count of unread notifications
   * Requires authentication only
   */
  fastify.get(
    "/notifications/unread-count",
    {
      schema: {
        response: { 200: unreadCountResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    notificationController.getUnreadCount,
  );

  /**
   * GET /trips/:tripId/notifications
   * List paginated notifications for a specific trip
   * Requires authentication only
   */
  fastify.get<{
    Params: { tripId: string };
    Querystring: { cursor?: string; limit: number; unreadOnly: boolean };
  }>(
    "/trips/:tripId/notifications",
    {
      schema: {
        params: tripIdParamsSchema,
        querystring: notificationQuerySchema,
        response: { 200: notificationListResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    notificationController.listTripNotifications,
  );

  /**
   * GET /trips/:tripId/notifications/unread-count
   * Get the count of unread notifications for a specific trip
   * Requires authentication only
   */
  fastify.get<{
    Params: { tripId: string };
  }>(
    "/trips/:tripId/notifications/unread-count",
    {
      schema: {
        params: tripIdParamsSchema,
        response: { 200: unreadCountResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    notificationController.getTripUnreadCount,
  );

  /**
   * GET /trips/:tripId/notification-preferences
   * Get notification preferences for a trip
   * Requires authentication only
   */
  fastify.get<{
    Params: { tripId: string };
  }>(
    "/trips/:tripId/notification-preferences",
    {
      schema: {
        params: tripIdParamsSchema,
        response: { 200: notificationPreferencesResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    notificationController.getPreferences,
  );

  // --- Mark-as-read routes (authenticate only, write rate limit) ---

  /**
   * PATCH /notifications/:notificationId/read
   * Mark a single notification as read
   * Requires authentication only (no complete profile required)
   */
  fastify.patch<{
    Params: { notificationId: string };
  }>(
    "/notifications/:notificationId/read",
    {
      schema: {
        params: notificationIdParamsSchema,
        response: { 200: successResponseSchema },
      },
      preHandler: [fastify.rateLimit(writeRateLimitConfig), authenticate],
    },
    notificationController.markAsRead,
  );

  /**
   * PATCH /notifications/read-all
   * Mark all notifications as read, optionally scoped to a trip
   * Requires authentication only (no complete profile required)
   */
  fastify.patch<{
    Body?: { tripId?: string };
  }>(
    "/notifications/read-all",
    {
      schema: {
        response: { 200: successResponseSchema },
      },
      preHandler: [fastify.rateLimit(writeRateLimitConfig), authenticate],
    },
    notificationController.markAllAsRead,
  );

  // --- Write scope (authenticate + requireCompleteProfile + writeRateLimitConfig) ---

  /**
   * Write routes scope
   * All routes registered here share authenticate + requireCompleteProfile hooks
   * with stricter rate limiting for write operations
   */
  fastify.register(async (scope) => {
    scope.addHook("preHandler", scope.rateLimit(writeRateLimitConfig));
    scope.addHook("preHandler", authenticate);
    scope.addHook("preHandler", requireCompleteProfile);

    /**
     * PUT /trips/:tripId/notification-preferences
     * Create or update notification preferences for a trip
     */
    scope.put<{
      Params: { tripId: string };
      Body: NotificationPreferencesInput;
    }>(
      "/trips/:tripId/notification-preferences",
      {
        schema: {
          params: tripIdParamsSchema,
          body: notificationPreferencesSchema,
          response: { 200: notificationPreferencesResponseSchema },
        },
      },
      notificationController.updatePreferences,
    );
  });
}
