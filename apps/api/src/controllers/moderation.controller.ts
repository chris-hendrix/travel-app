import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  BlockUserInput,
  ReportUserInput,
  UnblockUserParams,
} from "@journiful/shared/schemas";

/**
 * Moderation Controller
 * Handles blocking, unblocking and reporting users
 */
export const moderationController = {
  /**
   * Block a user
   *
   * Answers 201 even on a repeat: the pair is unique and the insert is
   * `ON CONFLICT DO NOTHING`, so the second press of Block is the same
   * outcome as the first, not a complaint.
   *
   * @route POST /api/blocks
   * @middleware authenticate, checkBanned
   * @param request - Fastify request with the blocked user id
   * @param reply - Fastify reply object
   * @returns Success response with no payload
   */
  async blockUser(
    request: FastifyRequest<{ Body: BlockUserInput }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { moderationService } = request.server;
      const userId = request.user.sub;

      await moderationService.blockUser(userId, request.body.userId);

      return reply.status(201).send({ success: true });
    } catch (error) {
      // Re-throw typed errors for error handler (CannotModerateSelfError)
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        { error, userId: request.user.sub },
        "Failed to block user",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to block user",
        },
      });
    }
  },

  /**
   * List the users the caller has blocked
   *
   * The rows the caller wrote (`blocker_id = caller`), newest first. A
   * block the caller is on the receiving end of is somebody else's
   * record, not a row to manage here.
   *
   * @route GET /api/blocks
   * @middleware authenticate, checkBanned
   * @param request - Fastify request
   * @param reply - Fastify reply object
   * @returns Success response with the blocked users
   */
  async listBlocked(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { moderationService } = request.server;
      const userId = request.user.sub;

      const blocks = await moderationService.listBlockedWithProfiles(userId);

      return reply.status(200).send({ success: true, blocks });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        { error, userId: request.user.sub },
        "Failed to list blocked users",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list blocked users",
        },
      });
    }
  },

  /**
   * Unblock a user
   *
   * Idempotent, and it only lifts the caller's own row: a block the other
   * way round, if any, still stands.
   *
   * @route DELETE /api/blocks/:userId
   * @middleware authenticate, checkBanned
   * @param request - Fastify request with the blocked user id
   * @param reply - Fastify reply object
   * @returns Success response with no payload
   */
  async unblockUser(
    request: FastifyRequest<{ Params: UnblockUserParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { moderationService } = request.server;
      const userId = request.user.sub;

      await moderationService.unblockUser(userId, request.params.userId);

      return reply.status(200).send({ success: true });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        { error, userId: request.user.sub },
        "Failed to unblock user",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to unblock user",
        },
      });
    }
  },

  /**
   * Report a user
   *
   * The trip is optional because a report has to outlive the trip it was
   * made in. No response payload: the report is not the reporter's to
   * read back.
   *
   * @route POST /api/reports
   * @middleware authenticate, checkBanned
   * @param request - Fastify request with the report body
   * @param reply - Fastify reply object
   * @returns Success response with no payload
   */
  async reportUser(
    request: FastifyRequest<{ Body: ReportUserInput }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { moderationService } = request.server;
      const userId = request.user.sub;
      const { userId: reportedId, tripId, reason, note } = request.body;

      await moderationService.reportUser({
        reporterId: userId,
        reportedId,
        tripId: tripId ?? null,
        reason,
        note: note ?? null,
      });

      return reply.status(201).send({ success: true });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        { error, userId: request.user.sub },
        "Failed to report user",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to report user",
        },
      });
    }
  },
};
