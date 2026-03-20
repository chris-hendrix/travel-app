import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { userController } from "@/controllers/user.controller.js";
import { authenticate } from "@/middleware/auth.middleware.js";
import { writeRateLimitConfig } from "@/middleware/rate-limit.middleware.js";
import {
  updateProfileSchema,
  userResponseSchema,
} from "@journiful/shared/schemas";
import type { UpdateProfileInput } from "@journiful/shared/schemas";

// Response schema for user profile endpoints
const userProfileResponseSchema = z.object({
  success: z.literal(true),
  user: userResponseSchema,
});

/**
 * User Routes
 * Registers all user profile management endpoints
 *
 * All routes require authentication and use write rate limiting.
 *
 * @param fastify - Fastify instance
 */
export async function userRoutes(fastify: FastifyInstance) {
  // All user profile routes require authentication and write rate limiting
  fastify.register(async (scope) => {
    scope.addHook("preHandler", scope.rateLimit(writeRateLimitConfig));
    scope.addHook("preHandler", authenticate);

    /**
     * PUT /me
     * Update user profile (displayName, timezone, handles)
     */
    scope.put<{ Body: UpdateProfileInput }>(
      "/me",
      {
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
        schema: {
          response: { 200: userProfileResponseSchema },
        },
      },
      userController.removeProfilePhoto,
    );
  });
}
