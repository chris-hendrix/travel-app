import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateEventInput,
  UpdateEventInput,
} from "@journiful/shared/schemas";
import { EventNotFoundError, TripNotFoundError } from "../errors.js";
import { auditLog } from "@/utils/audit.js";

/**
 * Event Controller
 * Handles event-related HTTP requests
 */
export const eventController = {
  /**
   * Create event endpoint
   * Creates a new event for a trip
   *
   * @route POST /api/trips/:tripId/events
   * @middleware authenticate, requireCompleteProfile
   * @param request - Fastify request with event data in body
   * @param reply - Fastify reply object
   * @returns Success response with created event
   */
  async createEvent(
    request: FastifyRequest<{
      Params: { tripId: string };
      Body: CreateEventInput;
    }>,
    reply: FastifyReply,
  ) {
    // Params and body are validated by Fastify route schema
    const { tripId } = request.params;
    const data = request.body;

    try {
      const { eventService } = request.server;

      // Get userId from authenticated user (populated by authenticate middleware)
      const userId = request.user.sub;

      // Create event via service
      const event = await eventService.createEvent(userId, tripId, data);

      // Return success response with 201 status
      return reply.status(201).send({
        success: true,
        event,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error for debugging
      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to create event",
      );

      // Return generic error response
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create event",
        },
      });
    }
  },

  /**
   * List events endpoint
   * Returns events for a trip with optional filtering
   *
   * @route GET /api/trips/:tripId/events
   * @middleware authenticate
   * @param request - Fastify request
   * @param reply - Fastify reply object
   * @returns Success response with events array
   */
  async listEvents(
    request: FastifyRequest<{
      Params: { tripId: string };
      Querystring: { type?: string; includeDeleted?: boolean };
    }>,
    reply: FastifyReply,
  ) {
    try {
      const { eventService, permissionsService } = request.server;
      const { tripId } = request.params;
      const userId = request.user.sub;

      // Query params are validated and coerced by Fastify route schema
      const { includeDeleted = false } = request.query;

      // Check if user is a member of the trip
      const isMember = await permissionsService.isMember(userId, tripId);
      if (!isMember) {
        throw new TripNotFoundError();
      }

      // Non-going, non-organizer members only get preview access (no itinerary data)
      const canViewFull = await permissionsService.canViewFullTrip(
        userId,
        tripId,
      );
      const isOrg = await permissionsService.isOrganizer(userId, tripId);
      if (!canViewFull && !isOrg) {
        return reply.status(403).send({
          success: false,
          error: "PREVIEW_ACCESS_ONLY",
          message: "Full trip data requires Going RSVP status",
        });
      }

      // Get events for the trip
      let events = await eventService.getEventsByTrip(tripId, includeDeleted);

      // Filter by type if provided
      if (request.query.type) {
        events = events.filter(
          (event) => event.eventType === request.query.type,
        );
      }

      return reply.status(200).send({
        success: true,
        events,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to list events",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get events",
        },
      });
    }
  },

  /**
   * Get event by ID
   * Returns event details for authorized users
   *
   * @route GET /api/events/:id
   * @middleware authenticate
   */
  async getEvent(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { eventService, permissionsService } = request.server;
      // Params are validated by Fastify route schema (UUID format)
      const { id } = request.params;
      const userId = request.user.sub;

      // Get event from service
      const event = await eventService.getEvent(id);

      // Handle null response (not found or soft-deleted)
      if (!event) {
        throw new EventNotFoundError();
      }

      // Check if user is a member of the trip
      const isMember = await permissionsService.isMember(userId, event.tripId);
      if (!isMember) {
        throw new EventNotFoundError();
      }

      // Non-going, non-organizer members only get preview access (no itinerary data)
      const canViewFull = await permissionsService.canViewFullTrip(
        userId,
        event.tripId,
      );
      const isOrg = await permissionsService.isOrganizer(userId, event.tripId);
      if (!canViewFull && !isOrg) {
        return reply.status(403).send({
          success: false,
          error: "PREVIEW_ACCESS_ONLY",
          message: "Full trip data requires Going RSVP status",
        });
      }

      // Return success response
      return reply.status(200).send({
        success: true,
        event,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        {
          error,
          userId: request.user.sub,
          eventId: request.params.id,
        },
        "Failed to get event",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get event",
        },
      });
    }
  },

  /**
   * Update event endpoint
   * Updates an existing event's details
   * Only organizers can update events
   *
   * @route PUT /api/events/:id
   * @middleware authenticate, requireCompleteProfile
   */
  async updateEvent(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateEventInput }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params and body are validated by Fastify route schema
      const { id } = request.params;
      const data = request.body;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to update event
      const event = await request.server.eventService.updateEvent(
        userId,
        id,
        data,
      );

      // Return success response
      return reply.status(200).send({
        success: true,
        event,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error and return 500
      request.log.error(
        {
          error,
          userId: request.user.sub,
          eventId: request.params.id,
        },
        "Failed to update event",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update event",
        },
      });
    }
  },

  /**
   * Delete event endpoint
   * Soft-deletes an event if user is an organizer
   *
   * @route DELETE /api/events/:id
   * @middleware authenticate, requireCompleteProfile
   */
  async deleteEvent(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params are validated by Fastify route schema
      const { id } = request.params;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to delete event (soft delete)
      await request.server.eventService.deleteEvent(userId, id);

      auditLog(request, "event.delete", {
        resourceType: "event",
        resourceId: id,
      });

      // Return success response
      return reply.status(200).send({
        success: true,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error and return 500
      request.log.error(
        {
          error,
          userId: request.user.sub,
          eventId: request.params.id,
        },
        "Failed to delete event",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete event",
        },
      });
    }
  },

  /**
   * Restore event endpoint
   * Restores a soft-deleted event
   * Only organizers can restore events
   *
   * @route POST /api/events/:id/restore
   * @middleware authenticate, requireCompleteProfile
   */
  async restoreEvent(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params are validated by Fastify route schema
      const { id } = request.params;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to restore event
      const event = await request.server.eventService.restoreEvent(userId, id);

      // Return success response
      return reply.status(200).send({
        success: true,
        event,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error and return 500
      request.log.error(
        {
          error,
          userId: request.user.sub,
          eventId: request.params.id,
        },
        "Failed to restore event",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to restore event",
        },
      });
    }
  },
};
