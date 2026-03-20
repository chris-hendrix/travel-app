import type { FastifyRequest, FastifyReply } from "fastify";
import type { NotificationPreferencesInput } from "@journiful/shared/schemas";

/**
 * Notification Controller
 * Handles notification-related HTTP requests
 */
export const notificationController = {
  /**
   * List notifications endpoint
   * Returns paginated notifications for the authenticated user
   *
   * @route GET /api/notifications
   * @middleware authenticate
   */
  async listNotifications(
    request: FastifyRequest<{
      Querystring: {
        cursor?: string;
        limit: number;
        unreadOnly: boolean;
        tripId?: string;
      };
    }>,
    reply: FastifyReply,
  ) {
    const { notificationService } = request.server;
    const userId = request.user.sub;
    const { cursor, limit, unreadOnly, tripId } = request.query;

    const { data, meta, unreadCount } =
      await notificationService.getNotifications(userId, {
        ...(cursor != null ? { cursor } : {}),
        limit,
        unreadOnly,
        ...(tripId != null ? { tripId } : {}),
      });

    return reply.status(200).send({
      success: true,
      notifications: data,
      meta,
      unreadCount,
    });
  },

  /**
   * Get unread count endpoint
   * Returns the count of unread notifications for the authenticated user
   *
   * @route GET /api/notifications/unread-count
   * @middleware authenticate
   */
  async getUnreadCount(request: FastifyRequest, reply: FastifyReply) {
    const { notificationService } = request.server;
    const userId = request.user.sub;

    const count = await notificationService.getUnreadCount(userId);

    return reply.status(200).send({
      success: true,
      count,
    });
  },

  /**
   * Mark notification as read endpoint
   * Marks a single notification as read
   *
   * @route PATCH /api/notifications/:notificationId/read
   * @middleware authenticate
   */
  async markAsRead(
    request: FastifyRequest<{
      Params: { notificationId: string };
    }>,
    reply: FastifyReply,
  ) {
    const { notificationService } = request.server;
    const { notificationId } = request.params;
    const userId = request.user.sub;

    await notificationService.markAsRead(notificationId, userId);

    return reply.status(200).send({
      success: true,
    });
  },

  /**
   * Mark all notifications as read endpoint
   * Marks all notifications as read, optionally scoped to a trip
   *
   * @route PATCH /api/notifications/read-all
   * @middleware authenticate
   */
  async markAllAsRead(
    request: FastifyRequest<{
      Body?: { tripId?: string };
    }>,
    reply: FastifyReply,
  ) {
    const { notificationService } = request.server;
    const userId = request.user.sub;
    const tripId = request.body?.tripId;

    await notificationService.markAllAsRead(userId, tripId);

    return reply.status(200).send({
      success: true,
    });
  },

  /**
   * List trip notifications endpoint
   * Returns paginated notifications for a specific trip
   *
   * @route GET /api/trips/:tripId/notifications
   * @middleware authenticate
   */
  async listTripNotifications(
    request: FastifyRequest<{
      Params: { tripId: string };
      Querystring: { cursor?: string; limit: number; unreadOnly: boolean };
    }>,
    reply: FastifyReply,
  ) {
    const { notificationService } = request.server;
    const userId = request.user.sub;
    const { tripId } = request.params;
    const { cursor, limit, unreadOnly } = request.query;

    const { data, meta, unreadCount } =
      await notificationService.getNotifications(userId, {
        ...(cursor != null ? { cursor } : {}),
        limit,
        unreadOnly,
        tripId,
      });

    return reply.status(200).send({
      success: true,
      notifications: data,
      meta,
      unreadCount,
    });
  },

  /**
   * Get trip unread count endpoint
   * Returns the count of unread notifications for a specific trip
   *
   * @route GET /api/trips/:tripId/notifications/unread-count
   * @middleware authenticate
   */
  async getTripUnreadCount(
    request: FastifyRequest<{
      Params: { tripId: string };
    }>,
    reply: FastifyReply,
  ) {
    const { notificationService } = request.server;
    const userId = request.user.sub;
    const { tripId } = request.params;

    const count = await notificationService.getTripUnreadCount(userId, tripId);

    return reply.status(200).send({
      success: true,
      count,
    });
  },

  /**
   * Get notification preferences endpoint
   * Returns notification preferences for a user and trip
   *
   * @route GET /api/trips/:tripId/notification-preferences
   * @middleware authenticate
   */
  async getPreferences(
    request: FastifyRequest<{
      Params: { tripId: string };
    }>,
    reply: FastifyReply,
  ) {
    const { notificationService } = request.server;
    const userId = request.user.sub;
    const { tripId } = request.params;

    const preferences = await notificationService.getPreferences(
      userId,
      tripId,
    );

    return reply.status(200).send({
      success: true,
      preferences,
    });
  },

  /**
   * Update notification preferences endpoint
   * Creates or updates notification preferences for a user and trip
   *
   * @route PUT /api/trips/:tripId/notification-preferences
   * @middleware authenticate, requireCompleteProfile
   */
  async updatePreferences(
    request: FastifyRequest<{
      Params: { tripId: string };
      Body: NotificationPreferencesInput;
    }>,
    reply: FastifyReply,
  ) {
    const { notificationService } = request.server;
    const userId = request.user.sub;
    const { tripId } = request.params;
    const body = request.body;

    const preferences = await notificationService.updatePreferences(
      userId,
      tripId,
      body,
    );

    return reply.status(200).send({
      success: true,
      preferences,
    });
  },
};
