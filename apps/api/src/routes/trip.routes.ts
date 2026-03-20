import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { tripController } from "@/controllers/trip.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import {
  defaultRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import {
  createTripSchema,
  updateTripSchema,
  addCoOrganizerSchema,
  cursorPaginationSchema,
  updateMemberRoleSchema,
  tripListResponseSchema,
  tripDetailResponseSchema,
  tripResponseSchema,
  successResponseSchema,
  updateRsvpResponseSchema,
} from "@journiful/shared/schemas";
import type {
  CursorPaginationInput,
  CreateTripInput,
  UpdateTripInput,
  AddCoOrganizerInput,
  UpdateMemberRoleInput,
} from "@journiful/shared/schemas";

// Reusable param schemas
const tripIdParamsSchema = z.object({
  id: z.string().uuid({ message: "Invalid trip ID format" }),
});

const removeCoOrganizerParamsSchema = z.object({
  id: z.string().uuid({ message: "Invalid ID format" }),
  userId: z.string().uuid({ message: "Invalid ID format" }),
});

const memberRoleParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
  memberId: z.string().uuid({ message: "Invalid member ID format" }),
});

/**
 * Trip Routes
 * Registers all trip-related endpoints
 *
 * Read-only routes (GET) require authentication only.
 * Write routes (POST/PUT/DELETE) require authentication and complete profile,
 * applied via a scoped plugin with shared preHandler hooks.
 *
 * @param fastify - Fastify instance
 */
export async function tripRoutes(fastify: FastifyInstance) {
  /**
   * GET /
   * Get user's trips
   * Requires authentication only (not complete profile)
   */
  fastify.get<{ Querystring: CursorPaginationInput }>(
    "/",
    {
      schema: {
        querystring: cursorPaginationSchema,
        response: { 200: tripListResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    tripController.getUserTrips,
  );

  /**
   * GET /:id
   * Get trip by ID
   * Requires authentication only (not complete profile)
   * Returns 404 for both non-existent trips and trips user is not a member of
   */
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        params: tripIdParamsSchema,
        response: { 200: tripDetailResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    tripController.getTripById,
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
     * POST /
     * Create a new trip
     */
    scope.post<{ Body: CreateTripInput }>(
      "/",
      {
        schema: {
          body: createTripSchema,
          response: { 201: tripResponseSchema },
        },
      },
      tripController.createTrip,
    );

    /**
     * PUT /:id
     * Update trip details
     * Only organizers can update trips
     */
    scope.put<{ Params: { id: string }; Body: UpdateTripInput }>(
      "/:id",
      {
        schema: {
          params: tripIdParamsSchema,
          body: updateTripSchema,
          response: { 200: tripResponseSchema },
        },
      },
      tripController.updateTrip,
    );

    /**
     * DELETE /:id
     * Cancel trip (soft delete)
     * Only organizers can cancel trips
     */
    scope.delete<{ Params: { id: string } }>(
      "/:id",
      {
        schema: {
          params: tripIdParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      tripController.cancelTrip,
    );

    /**
     * POST /:id/co-organizers
     * Add co-organizer to trip
     * Only organizers can add co-organizers
     */
    scope.post<{ Params: { id: string }; Body: AddCoOrganizerInput }>(
      "/:id/co-organizers",
      {
        schema: {
          params: tripIdParamsSchema,
          body: addCoOrganizerSchema,
          response: { 200: successResponseSchema },
        },
      },
      tripController.addCoOrganizer,
    );

    /**
     * DELETE /:id/co-organizers/:userId
     * Remove co-organizer from trip
     * Only organizers can remove co-organizers
     */
    scope.delete<{ Params: { id: string; userId: string } }>(
      "/:id/co-organizers/:userId",
      {
        schema: {
          params: removeCoOrganizerParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      tripController.removeCoOrganizer,
    );

    /**
     * POST /:id/cover-image
     * Upload cover image for trip
     * Only organizers can upload cover images
     * Note: No body schema for multipart routes
     */
    scope.post<{ Params: { id: string } }>(
      "/:id/cover-image",
      {
        schema: {
          params: tripIdParamsSchema,
          response: { 200: tripResponseSchema },
        },
      },
      tripController.uploadCoverImage,
    );

    /**
     * DELETE /:id/cover-image
     * Delete cover image from trip
     * Only organizers can delete cover images
     */
    scope.delete<{ Params: { id: string } }>(
      "/:id/cover-image",
      {
        schema: {
          params: tripIdParamsSchema,
          response: { 200: tripResponseSchema },
        },
      },
      tripController.deleteCoverImage,
    );

    /**
     * PATCH /:tripId/members/:memberId
     * Update member role (promote/demote co-organizer)
     * Only organizers can update member roles
     */
    scope.patch<{
      Params: { tripId: string; memberId: string };
      Body: UpdateMemberRoleInput;
    }>(
      "/:tripId/members/:memberId",
      {
        schema: {
          params: memberRoleParamsSchema,
          body: updateMemberRoleSchema,
          response: { 200: updateRsvpResponseSchema },
        },
      },
      tripController.updateMemberRole,
    );
  });
}
