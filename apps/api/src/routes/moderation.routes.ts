import type { FastifyInstance } from "fastify";
import { moderationController } from "@/controllers/moderation.controller.js";
import { authenticate } from "@/middleware/auth.middleware.js";
import { checkBanned } from "@/middleware/admin.middleware.js";
import { writeRateLimitConfig } from "@/middleware/rate-limit.middleware.js";
import {
  blockUserSchema,
  blockedUsersResponseSchema,
  reportUserSchema,
  successResponseSchema,
  unblockUserParamsSchema,
  type BlockUserInput,
  type ReportUserInput,
  type UnblockUserParams,
} from "@journiful/shared/schemas";

/**
 * Moderation Routes
 * Registers the blocking and reporting endpoints
 *
 * One scope, because all four routes are one thing: an authenticated,
 * live account deciding who it can see and who it can tell on. The
 * `checkBanned` hook is what keeps a suspended or deleted account out —
 * a person who cannot use the app cannot moderate anybody in it.
 *
 * @param fastify - Fastify instance
 */
export async function moderationRoutes(fastify: FastifyInstance) {
  fastify.register(async (scope) => {
    scope.addHook("preHandler", scope.rateLimit(writeRateLimitConfig));
    scope.addHook("preHandler", authenticate);
    scope.addHook("preHandler", checkBanned);

    /**
     * POST /blocks
     * Block a user. Idempotent — a repeat is also 201.
     */
    scope.post<{ Body: BlockUserInput }>(
      "/blocks",
      {
        schema: {
          body: blockUserSchema,
          response: { 201: successResponseSchema },
        },
      },
      moderationController.blockUser,
    );

    /**
     * GET /blocks
     * The people the caller has blocked, with enough profile to render.
     */
    scope.get(
      "/blocks",
      {
        schema: {
          response: { 200: blockedUsersResponseSchema },
        },
      },
      moderationController.listBlocked,
    );

    /**
     * DELETE /blocks/:userId
     * Lift the caller's own block. Idempotent.
     */
    scope.delete<{ Params: UnblockUserParams }>(
      "/blocks/:userId",
      {
        schema: {
          params: unblockUserParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      moderationController.unblockUser,
    );

    /**
     * POST /reports
     * Report a user, optionally in the context of a trip.
     */
    scope.post<{ Body: ReportUserInput }>(
      "/reports",
      {
        schema: {
          body: reportUserSchema,
          response: { 201: successResponseSchema },
        },
      },
      moderationController.reportUser,
    );
  });
}
