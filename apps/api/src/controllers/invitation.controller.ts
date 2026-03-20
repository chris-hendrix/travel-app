import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateInvitationsInput,
  UpdateRsvpInput,
  UpdateMySettingsInput,
} from "@journiful/shared/schemas";
import { PermissionDeniedError } from "../errors.js";
import { auditLog } from "@/utils/audit.js";

/**
 * Invitation Controller
 * Handles invitation and RSVP-related HTTP requests
 */
export const invitationController = {
  /**
   * Create invitations endpoint
   * Creates batch invitations for a trip
   *
   * @route POST /api/trips/:tripId/invitations
   * @middleware authenticate, requireCompleteProfile
   * @param request - Fastify request with phone numbers in body
   * @param reply - Fastify reply object
   * @returns Success response with created invitations and skipped phones
   */
  async createInvitations(
    request: FastifyRequest<{
      Params: { tripId: string };
      Body: CreateInvitationsInput;
    }>,
    reply: FastifyReply,
  ) {
    // Params and body are validated by Fastify route schema
    const { tripId } = request.params;
    const { phoneNumbers, userIds } = request.body;

    try {
      const { invitationService } = request.server;

      // Get userId from authenticated user (populated by authenticate middleware)
      const userId = request.user.sub;

      // Create invitations via service
      const result = await invitationService.createInvitations(
        userId,
        tripId,
        phoneNumbers,
        userIds,
      );

      auditLog(request, "invitation.created", {
        resourceType: "trip",
        resourceId: tripId,
        metadata: {
          count: result.invitations.length,
          addedMembersCount: result.addedMembers.length,
        },
      });

      // Return success response with 201 status
      return reply.status(201).send({
        success: true,
        invitations: result.invitations,
        addedMembers: result.addedMembers,
        skipped: result.skipped,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error for debugging
      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to create invitations",
      );

      // Return generic error response
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create invitations",
        },
      });
    }
  },

  /**
   * Get invitations endpoint
   * Returns all invitations for a trip (organizer only)
   *
   * @route GET /api/trips/:tripId/invitations
   * @middleware authenticate
   * @param request - Fastify request
   * @param reply - Fastify reply object
   * @returns Success response with invitations array
   */
  async getInvitations(
    request: FastifyRequest<{ Params: { tripId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const { invitationService, permissionsService } = request.server;
      const { tripId } = request.params;
      const userId = request.user.sub;

      // Check if user is an organizer (listing invitations is organizer-only)
      const canInvite = await permissionsService.canInviteMembers(
        userId,
        tripId,
      );
      if (!canInvite) {
        throw new PermissionDeniedError(
          "Permission denied: only organizers can view invitations",
        );
      }

      // Get invitations for the trip
      const invitations = await invitationService.getInvitationsByTrip(tripId);

      return reply.status(200).send({
        success: true,
        invitations,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to get invitations",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get invitations",
        },
      });
    }
  },

  /**
   * Revoke invitation endpoint
   * Revokes an invitation and removes associated member record
   *
   * @route DELETE /api/invitations/:id
   * @middleware authenticate, requireCompleteProfile
   * @param request - Fastify request with invitation ID in params
   * @param reply - Fastify reply object
   * @returns Success response
   */
  async revokeInvitation(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      // Params are validated by Fastify route schema
      const { id } = request.params;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to revoke invitation
      await request.server.invitationService.revokeInvitation(userId, id);

      auditLog(request, "invitation.revoked", {
        resourceType: "invitation",
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
          invitationId: request.params.id,
        },
        "Failed to revoke invitation",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to revoke invitation",
        },
      });
    }
  },

  /**
   * Remove member endpoint
   * Removes a member from a trip and deletes associated invitation
   *
   * @route DELETE /api/trips/:tripId/members/:memberId
   * @middleware authenticate, requireCompleteProfile
   * @param request - Fastify request with tripId and memberId in params
   * @param reply - Fastify reply object
   * @returns 204 No Content on success
   */
  async removeMember(
    request: FastifyRequest<{
      Params: { tripId: string; memberId: string };
    }>,
    reply: FastifyReply,
  ) {
    try {
      const { tripId, memberId } = request.params;
      const userId = request.user.sub;

      await request.server.invitationService.removeMember(
        userId,
        tripId,
        memberId,
      );

      auditLog(request, "member.removed", {
        resourceType: "trip",
        resourceId: tripId,
        metadata: { memberId },
      });

      return reply.status(204).send();
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        {
          error,
          userId: request.user.sub,
          tripId: request.params.tripId,
          memberId: request.params.memberId,
        },
        "Failed to remove member",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to remove member",
        },
      });
    }
  },

  /**
   * Update RSVP endpoint
   * Updates a member's RSVP status for a trip
   *
   * @route POST /api/trips/:tripId/rsvp
   * @middleware authenticate, requireCompleteProfile
   * @param request - Fastify request with RSVP status in body
   * @param reply - Fastify reply object
   * @returns Success response with updated member data
   */
  async updateRsvp(
    request: FastifyRequest<{
      Params: { tripId: string };
      Body: UpdateRsvpInput;
    }>,
    reply: FastifyReply,
  ) {
    // Params and body are validated by Fastify route schema
    const { tripId } = request.params;
    const { status, sharePhone } = request.body;

    try {
      const { invitationService } = request.server;

      // Get userId from authenticated user
      const userId = request.user.sub;

      // Update RSVP via service
      const member = await invitationService.updateRsvp(
        userId,
        tripId,
        status,
        sharePhone,
      );

      auditLog(request, "member.rsvp_updated", {
        resourceType: "trip",
        resourceId: tripId,
        metadata: { status },
      });

      // Return success response
      return reply.status(200).send({
        success: true,
        member,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to update RSVP",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update RSVP",
        },
      });
    }
  },

  /**
   * Get members endpoint
   * Returns all members of a trip with profile information
   *
   * @route GET /api/trips/:tripId/members
   * @middleware authenticate
   * @param request - Fastify request
   * @param reply - Fastify reply object
   * @returns Success response with members array
   */
  async getMembers(
    request: FastifyRequest<{ Params: { tripId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const { invitationService } = request.server;
      const { tripId } = request.params;
      const userId = request.user.sub;

      // Get members for the trip (service handles permission check)
      const members = await invitationService.getTripMembers(tripId, userId);

      return reply.status(200).send({
        success: true,
        members,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to get members",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get members",
        },
      });
    }
  },

  /**
   * Get my settings endpoint
   * Returns the current member's per-trip settings
   *
   * @route GET /api/trips/:tripId/my-settings
   * @middleware authenticate
   * @param request - Fastify request
   * @param reply - Fastify reply object
   * @returns Success response with settings
   */
  async getMySettings(
    request: FastifyRequest<{ Params: { tripId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const { invitationService } = request.server;
      const userId = request.user.sub;
      const { tripId } = request.params;

      const settings = await invitationService.getMySettings(userId, tripId);

      return reply.status(200).send({
        success: true as const,
        sharePhone: settings.sharePhone,
        calendarExcluded: settings.calendarExcluded,
      });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to get my settings",
      );
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get my settings",
        },
      });
    }
  },

  /**
   * Update my settings endpoint
   * Updates the current member's per-trip settings
   *
   * @route PATCH /api/trips/:tripId/my-settings
   * @middleware authenticate, requireCompleteProfile
   * @param request - Fastify request with settings in body
   * @param reply - Fastify reply object
   * @returns Success response with updated settings
   */
  async updateMySettings(
    request: FastifyRequest<{
      Params: { tripId: string };
      Body: UpdateMySettingsInput;
    }>,
    reply: FastifyReply,
  ) {
    try {
      const { invitationService } = request.server;
      const userId = request.user.sub;
      const { tripId } = request.params;
      const { sharePhone } = request.body;

      const settings = await invitationService.updateMySettings(
        userId,
        tripId,
        sharePhone,
      );

      auditLog(request, "member.settings.updated", {
        resourceType: "trip",
        resourceId: tripId,
        metadata: { sharePhone },
      });

      return reply.status(200).send({
        success: true as const,
        sharePhone: settings.sharePhone,
        calendarExcluded: settings.calendarExcluded,
      });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to update my settings",
      );
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update my settings",
        },
      });
    }
  },
};
