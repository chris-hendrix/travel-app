import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { invitationController } from "@/controllers/invitation.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import {
  defaultRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import {
  createInvitationsSchema,
  updateRsvpSchema,
  updateMySettingsSchema,
  mySettingsResponseSchema,
  createInvitationsResponseSchema,
  getInvitationsResponseSchema,
  getMembersResponseSchema,
  updateRsvpResponseSchema,
  successResponseSchema,
} from "@journiful/shared/schemas";
import type {
  CreateInvitationsInput,
  UpdateRsvpInput,
  UpdateMySettingsInput,
} from "@journiful/shared/schemas";

// Reusable param schemas
const tripIdParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

const invitationIdParamsSchema = z.object({
  id: z.string().uuid({ message: "Invalid invitation ID format" }),
});

const memberRemovalParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
  memberId: z.string().uuid({ message: "Invalid member ID format" }),
});

/**
 * Invitation Routes
 * Registers all invitation and RSVP-related endpoints
 *
 * Read-only routes (GET) require authentication only.
 * Write routes (POST/DELETE) require authentication and complete profile,
 * applied via a scoped plugin with shared preHandler hooks.
 *
 * @param fastify - Fastify instance
 */
export async function invitationRoutes(fastify: FastifyInstance) {
  /**
   * GET /trips/:tripId/invitations
   * List invitations for a trip (organizer only)
   * Requires authentication only (not complete profile)
   */
  fastify.get<{ Params: { tripId: string } }>(
    "/trips/:tripId/invitations",
    {
      schema: {
        params: tripIdParamsSchema,
        response: { 200: getInvitationsResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    invitationController.getInvitations,
  );

  /**
   * GET /trips/:tripId/members
   * List members of a trip
   * Requires authentication only (not complete profile)
   */
  fastify.get<{ Params: { tripId: string } }>(
    "/trips/:tripId/members",
    {
      schema: {
        params: tripIdParamsSchema,
        response: { 200: getMembersResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    invitationController.getMembers,
  );

  /**
   * GET /trips/:tripId/my-settings
   * Get current member's per-trip settings
   * Requires authentication only (not complete profile)
   */
  fastify.get<{ Params: { tripId: string } }>(
    "/trips/:tripId/my-settings",
    {
      schema: {
        params: tripIdParamsSchema,
        response: { 200: mySettingsResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    invitationController.getMySettings,
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
     * POST /trips/:tripId/invitations
     * Create batch invitations for a trip
     */
    scope.post<{ Params: { tripId: string }; Body: CreateInvitationsInput }>(
      "/trips/:tripId/invitations",
      {
        schema: {
          params: tripIdParamsSchema,
          body: createInvitationsSchema,
          response: { 201: createInvitationsResponseSchema },
        },
      },
      invitationController.createInvitations,
    );

    /**
     * DELETE /invitations/:id
     * Revoke an invitation
     * Only organizers can revoke invitations
     */
    scope.delete<{ Params: { id: string } }>(
      "/invitations/:id",
      {
        schema: {
          params: invitationIdParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      invitationController.revokeInvitation,
    );

    /**
     * DELETE /trips/:tripId/members/:memberId
     * Remove a member from a trip
     * Only organizers can remove members
     */
    scope.delete<{ Params: { tripId: string; memberId: string } }>(
      "/trips/:tripId/members/:memberId",
      {
        schema: {
          params: memberRemovalParamsSchema,
          response: { 204: z.null().optional() },
        },
      },
      invitationController.removeMember,
    );

    /**
     * POST /trips/:tripId/rsvp
     * Update RSVP status for a trip
     */
    scope.post<{ Params: { tripId: string }; Body: UpdateRsvpInput }>(
      "/trips/:tripId/rsvp",
      {
        schema: {
          params: tripIdParamsSchema,
          body: updateRsvpSchema,
          response: { 200: updateRsvpResponseSchema },
        },
      },
      invitationController.updateRsvp,
    );

    /**
     * PATCH /trips/:tripId/my-settings
     * Update current member's per-trip settings
     */
    scope.patch<{ Params: { tripId: string }; Body: UpdateMySettingsInput }>(
      "/trips/:tripId/my-settings",
      {
        schema: {
          params: tripIdParamsSchema,
          body: updateMySettingsSchema,
          response: { 200: mySettingsResponseSchema },
        },
      },
      invitationController.updateMySettings,
    );
  });
}
