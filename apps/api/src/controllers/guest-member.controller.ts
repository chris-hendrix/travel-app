import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateGuestInput,
  UpdateGuestInput,
} from "@journiful/shared/schemas";
import type { members } from "@/db/schema/index.js";
import { auditLog } from "@/utils/audit.js";

type GuestRow = typeof members.$inferSelect;

/**
 * Map a guest member row to the organizer-view MemberWithProfile shape:
 * userId null, guestPhone surfaced, no isGuest field.
 */
function toGuestMemberResponse(row: GuestRow) {
  return {
    id: row.id,
    userId: null,
    displayName: row.guestDisplayName ?? "",
    profilePhotoUrl: null,
    handles: null,
    ...(row.guestPhone ? { guestPhone: row.guestPhone } : {}),
    status: row.status,
    isOrganizer: false,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}

/**
 * Guest Member Controller
 * Handles organizer-only guest member CRUD HTTP requests
 */
export const guestMemberController = {
  /**
   * Create guest endpoint
   *
   * @route POST /api/trips/:tripId/members/guests
   * @middleware authenticate, requireCompleteProfile
   */
  async createGuest(
    request: FastifyRequest<{
      Params: { tripId: string };
      Body: CreateGuestInput;
    }>,
    reply: FastifyReply,
  ) {
    try {
      const { tripId } = request.params;
      const userId = request.user.sub;

      const guest = await request.server.guestMemberService.createGuest(
        tripId,
        userId,
        request.body,
      );

      auditLog(request, "guest.created", {
        resourceType: "trip",
        resourceId: tripId,
        metadata: { memberId: guest.id },
      });

      return reply.status(201).send({
        success: true,
        member: toGuestMemberResponse(guest),
      });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to create guest member",
      );
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create guest member",
        },
      });
    }
  },

  /**
   * Update guest endpoint
   *
   * @route PATCH /api/trips/:tripId/members/guests/:memberId
   * @middleware authenticate, requireCompleteProfile
   */
  async updateGuest(
    request: FastifyRequest<{
      Params: { tripId: string; memberId: string };
      Body: UpdateGuestInput;
    }>,
    reply: FastifyReply,
  ) {
    try {
      const { tripId, memberId } = request.params;
      const userId = request.user.sub;

      const guest = await request.server.guestMemberService.updateGuest(
        tripId,
        userId,
        memberId,
        request.body,
      );

      auditLog(request, "guest.updated", {
        resourceType: "trip",
        resourceId: tripId,
        metadata: { memberId },
      });

      return reply.status(200).send({
        success: true,
        member: toGuestMemberResponse(guest),
      });
    } catch (error) {
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
        "Failed to update guest member",
      );
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update guest member",
        },
      });
    }
  },

  /**
   * Delete guest endpoint
   *
   * @route DELETE /api/trips/:tripId/members/guests/:memberId
   * @middleware authenticate, requireCompleteProfile
   */
  async deleteGuest(
    request: FastifyRequest<{
      Params: { tripId: string; memberId: string };
    }>,
    reply: FastifyReply,
  ) {
    try {
      const { tripId, memberId } = request.params;
      const userId = request.user.sub;

      await request.server.guestMemberService.deleteGuest(
        tripId,
        userId,
        memberId,
      );

      auditLog(request, "guest.deleted", {
        resourceType: "trip",
        resourceId: tripId,
        metadata: { memberId },
      });

      return reply.status(204).send();
    } catch (error) {
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
        "Failed to delete guest member",
      );
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete guest member",
        },
      });
    }
  },
};
