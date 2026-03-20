import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { accommodationController } from "@/controllers/accommodation.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import {
  defaultRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import {
  createAccommodationSchema,
  updateAccommodationSchema,
  accommodationListResponseSchema,
  accommodationResponseSchema,
  successResponseSchema,
} from "@journiful/shared/schemas";
import type {
  CreateAccommodationInput,
  UpdateAccommodationInput,
} from "@journiful/shared/schemas";

// Reusable param schemas
const tripIdParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

const accommodationIdParamsSchema = z.object({
  id: z.string().uuid({ message: "Invalid accommodation ID format" }),
});

// Query string schema for listing accommodations
const listAccommodationsQuerySchema = z.object({
  includeDeleted: z
    .string()
    .transform((val) => val === "true")
    .optional(),
});

/**
 * Accommodation Routes
 * Registers all accommodation-related endpoints
 *
 * Read-only routes (GET) require authentication only.
 * Write routes (POST/PUT/DELETE) require authentication and complete profile,
 * applied via a scoped plugin with shared preHandler hooks.
 *
 * @param fastify - Fastify instance
 */
export async function accommodationRoutes(fastify: FastifyInstance) {
  /**
   * GET /trips/:tripId/accommodations
   * List accommodations for a trip
   * Requires authentication only (not complete profile)
   * Supports optional query param: includeDeleted
   */
  fastify.get<{
    Params: { tripId: string };
    Querystring: { includeDeleted?: boolean };
  }>(
    "/trips/:tripId/accommodations",
    {
      schema: {
        params: tripIdParamsSchema,
        querystring: listAccommodationsQuerySchema,
        response: { 200: accommodationListResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    accommodationController.listAccommodations,
  );

  /**
   * GET /accommodations/:id
   * Get accommodation by ID
   * Requires authentication only (not complete profile)
   */
  fastify.get<{ Params: { id: string } }>(
    "/accommodations/:id",
    {
      schema: {
        params: accommodationIdParamsSchema,
        response: { 200: accommodationResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    accommodationController.getAccommodation,
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
     * POST /trips/:tripId/accommodations
     * Create a new accommodation for a trip
     */
    scope.post<{ Params: { tripId: string }; Body: CreateAccommodationInput }>(
      "/trips/:tripId/accommodations",
      {
        schema: {
          params: tripIdParamsSchema,
          body: createAccommodationSchema,
          response: { 201: accommodationResponseSchema },
        },
      },
      accommodationController.createAccommodation,
    );

    /**
     * PUT /accommodations/:id
     * Update accommodation details
     * Only organizers can update accommodations
     */
    scope.put<{ Params: { id: string }; Body: UpdateAccommodationInput }>(
      "/accommodations/:id",
      {
        schema: {
          params: accommodationIdParamsSchema,
          body: updateAccommodationSchema,
          response: { 200: accommodationResponseSchema },
        },
      },
      accommodationController.updateAccommodation,
    );

    /**
     * DELETE /accommodations/:id
     * Soft delete accommodation
     * Only organizers can delete accommodations
     */
    scope.delete<{ Params: { id: string } }>(
      "/accommodations/:id",
      {
        schema: {
          params: accommodationIdParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      accommodationController.deleteAccommodation,
    );

    /**
     * POST /accommodations/:id/restore
     * Restore soft-deleted accommodation
     * Only organizers can restore accommodations
     */
    scope.post<{ Params: { id: string } }>(
      "/accommodations/:id/restore",
      {
        schema: {
          params: accommodationIdParamsSchema,
          response: { 200: accommodationResponseSchema },
        },
      },
      accommodationController.restoreAccommodation,
    );
  });
}
