import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eventController } from "@/controllers/event.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import {
  defaultRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import {
  createEventSchema,
  updateEventSchema,
  eventListResponseSchema,
  eventResponseSchema,
  successResponseSchema,
} from "@journiful/shared/schemas";
import type {
  CreateEventInput,
  UpdateEventInput,
} from "@journiful/shared/schemas";

// Reusable param schemas
const tripIdParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

const eventIdParamsSchema = z.object({
  id: z.string().uuid({ message: "Invalid event ID format" }),
});

// Query string schema for listing events
const listEventsQuerySchema = z.object({
  type: z.enum(["travel", "meal", "activity"]).optional(),
  includeDeleted: z
    .string()
    .transform((val) => val === "true")
    .optional(),
});

/**
 * Event Routes
 * Registers all event-related endpoints
 *
 * Read-only routes (GET) require authentication only.
 * Write routes (POST/PUT/DELETE) require authentication and complete profile,
 * applied via a scoped plugin with shared preHandler hooks.
 *
 * @param fastify - Fastify instance
 */
export async function eventRoutes(fastify: FastifyInstance) {
  /**
   * GET /trips/:tripId/events
   * List events for a trip
   * Requires authentication only (not complete profile)
   * Supports optional query params: type, includeDeleted
   */
  fastify.get<{
    Params: { tripId: string };
    Querystring: { type?: string; includeDeleted?: boolean };
  }>(
    "/trips/:tripId/events",
    {
      schema: {
        params: tripIdParamsSchema,
        querystring: listEventsQuerySchema,
        response: { 200: eventListResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    eventController.listEvents,
  );

  /**
   * GET /events/:id
   * Get event by ID
   * Requires authentication only (not complete profile)
   */
  fastify.get<{ Params: { id: string } }>(
    "/events/:id",
    {
      schema: {
        params: eventIdParamsSchema,
        response: { 200: eventResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    eventController.getEvent,
  );

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
     * POST /trips/:tripId/events
     * Create a new event for a trip
     */
    scope.post<{ Params: { tripId: string }; Body: CreateEventInput }>(
      "/trips/:tripId/events",
      {
        schema: {
          params: tripIdParamsSchema,
          body: createEventSchema,
          response: { 201: eventResponseSchema },
        },
      },
      eventController.createEvent,
    );

    /**
     * PUT /events/:id
     * Update event details
     * Only organizers can update events
     */
    scope.put<{ Params: { id: string }; Body: UpdateEventInput }>(
      "/events/:id",
      {
        schema: {
          params: eventIdParamsSchema,
          body: updateEventSchema,
          response: { 200: eventResponseSchema },
        },
      },
      eventController.updateEvent,
    );

    /**
     * DELETE /events/:id
     * Soft delete event
     * Only organizers can delete events
     */
    scope.delete<{ Params: { id: string } }>(
      "/events/:id",
      {
        schema: {
          params: eventIdParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      eventController.deleteEvent,
    );

    /**
     * POST /events/:id/restore
     * Restore soft-deleted event
     * Only organizers can restore events
     */
    scope.post<{ Params: { id: string } }>(
      "/events/:id/restore",
      {
        schema: {
          params: eventIdParamsSchema,
          response: { 200: eventResponseSchema },
        },
      },
      eventController.restoreEvent,
    );
  });
}
