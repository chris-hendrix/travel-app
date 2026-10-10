import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { userController } from "@/controllers/user.controller.js";
import { authenticate } from "@/middleware/auth.middleware.js";
import { checkBanned } from "@/middleware/account-state.middleware.js";
import { writeRateLimitConfig } from "@/middleware/rate-limit.middleware.js";
import {
  updateProfileSchema,
  userResponseSchema,
  deleteAccountSchema,
  deleteAccountResponseSchema,
} from "@journiful/shared/schemas";
import type {
  UpdateProfileInput,
  DeleteAccountInput,
} from "@journiful/shared/schemas";

// Response schema for user profile endpoints
const userProfileResponseSchema = z.object({
  success: z.literal(true),
  user: userResponseSchema,
});

/**
 * User Routes
 * Registers all user profile management endpoints
 *
 * All routes require authentication and use write rate limiting. Only the
 * profile routes below carry `checkBanned`; see the sibling scope at the
 * bottom for why account deletion does not.
 *
 * @param fastify - Fastify instance
 */
export async function userRoutes(fastify: FastifyInstance) {
  // All user profile routes require authentication, write rate limiting, and
  // a live (not banned, not deleted) account
  fastify.register(async (scope) => {
    scope.addHook("preHandler", authenticate);
    scope.addHook("preHandler", checkBanned);

    /**
     * PUT /me
     * Update user profile (displayName, timezone, handles)
     */
    scope.put<{ Body: UpdateProfileInput }>(
      "/me",
      {
        config: { rateLimit: writeRateLimitConfig },
        schema: {
          body: updateProfileSchema,
          response: { 200: userProfileResponseSchema },
        },
      },
      userController.updateProfile,
    );

    /**
     * POST /me/photo
     * Upload profile photo (multipart)
     * Note: No body schema for multipart routes
     */
    scope.post(
      "/me/photo",
      {
        config: { rateLimit: writeRateLimitConfig },
        schema: {
          response: { 200: userProfileResponseSchema },
        },
      },
      userController.uploadProfilePhoto,
    );

    /**
     * DELETE /me/photo
     * Remove profile photo
     */
    scope.delete(
      "/me/photo",
      {
        config: { rateLimit: writeRateLimitConfig },
        schema: {
          response: { 200: userProfileResponseSchema },
        },
      },
      userController.removeProfilePhoto,
    );
  });

  /**
   * Account deletion gets its own sibling scope rather than a route inside the
   * one above. `checkBanned` there is added with `scope.addHook`, which applies
   * to every route in that scope and has no per-route opt-out — so a suspended
   * account would get 403 on a route App Store Review Guideline 5.1.1(v)
   * requires to work for every account holder. Only the write rate limit and
   * `authenticate` carry over. The ban is not lost: `deleteAccount` anonymizes
   * the row instead of dropping it, so the suspension survives in the record.
   */
  fastify.register(async (scope) => {
    scope.addHook("preHandler", authenticate);

    /**
     * DELETE /me
     * Delete the authenticated user's account (anonymized, not hard-deleted)
     *
     * The body carries `confirm: "delete"` as a guard against an accidental
     * call. A repeat call is accepted and answers 200.
     */
    scope.delete<{ Body: DeleteAccountInput }>(
      "/me",
      {
        config: { rateLimit: writeRateLimitConfig },
        schema: {
          body: deleteAccountSchema,
          response: { 200: deleteAccountResponseSchema },
        },
      },
      userController.deleteAccount,
    );
  });
}
