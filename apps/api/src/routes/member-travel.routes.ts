import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { memberTravelController } from "@/controllers/member-travel.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import {
  defaultRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import {
  createMemberTravelSchema,
  updateMemberTravelSchema,
  memberTravelListResponseSchema,
  memberTravelResponseSchema,
  successResponseSchema,
} from "@journiful/shared/schemas";
import type {
  CreateMemberTravelInput,
  UpdateMemberTravelInput,
} from "@journiful/shared/schemas";

// Reusable param schemas
const tripIdParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

const memberTravelIdParamsSchema = z.object({
  id: z.string().uuid({ message: "Invalid member travel ID format" }),
});

// Query string schema for listing member travel
const listMemberTravelQuerySchema = z.object({
  includeDeleted: z
    .string()
    .transform((val) => val === "true")
    .optional(),
});

/**
 * Member Travel Routes
 * Registers all member travel-related endpoints
 *
 * Read-only routes (GET) require authentication only.
 * Write routes (POST/PUT/DELETE) require authentication and complete profile,
 * applied via a scoped plugin with shared preHandler hooks.
 *
 * @param fastify - Fastify instance
 */
export async function memberTravelRoutes(fastify: FastifyInstance) {
  /**
   * GET /trips/:tripId/member-travel
   * List member travel for a trip
   * Requires authentication only (not complete profile)
   * Supports optional query param: includeDeleted
   */
  fastify.get<{
    Params: { tripId: string };
    Querystring: { includeDeleted?: boolean };
  }>(
    "/trips/:tripId/member-travel",
    {
      schema: {
        params: tripIdParamsSchema,
        querystring: listMemberTravelQuerySchema,
        response: { 200: memberTravelListResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    memberTravelController.listMemberTravel,
  );

  /**
   * GET /member-travel/:id
   * Get member travel by ID
   * Requires authentication only (not complete profile)
   */
  fastify.get<{ Params: { id: string } }>(
    "/member-travel/:id",
    {
      schema: {
        params: memberTravelIdParamsSchema,
        response: { 200: memberTravelResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    memberTravelController.getMemberTravel,
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
     * POST /trips/:tripId/member-travel
     * Create a new member travel for a trip
     */
    scope.post<{ Params: { tripId: string }; Body: CreateMemberTravelInput }>(
      "/trips/:tripId/member-travel",
      {
        schema: {
          params: tripIdParamsSchema,
          body: createMemberTravelSchema,
          response: { 201: memberTravelResponseSchema },
        },
      },
      memberTravelController.createMemberTravel,
    );

    /**
     * PUT /member-travel/:id
     * Update member travel details
     * Only organizers can update member travel
     */
    scope.put<{ Params: { id: string }; Body: UpdateMemberTravelInput }>(
      "/member-travel/:id",
      {
        schema: {
          params: memberTravelIdParamsSchema,
          body: updateMemberTravelSchema,
          response: { 200: memberTravelResponseSchema },
        },
      },
      memberTravelController.updateMemberTravel,
    );

    /**
     * DELETE /member-travel/:id
     * Soft delete member travel
     * Only organizers can delete member travel
     */
    scope.delete<{ Params: { id: string } }>(
      "/member-travel/:id",
      {
        schema: {
          params: memberTravelIdParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      memberTravelController.deleteMemberTravel,
    );

    /**
     * POST /member-travel/:id/restore
     * Restore soft-deleted member travel
     * Only organizers can restore member travel
     */
    scope.post<{ Params: { id: string } }>(
      "/member-travel/:id/restore",
      {
        schema: {
          params: memberTravelIdParamsSchema,
          response: { 200: memberTravelResponseSchema },
        },
      },
      memberTravelController.restoreMemberTravel,
    );
  });
}
