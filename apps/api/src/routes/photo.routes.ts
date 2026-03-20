import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { photoController } from "@/controllers/photo.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import {
  defaultRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import { updatePhotoCaptionSchema } from "@journiful/shared/schemas";
import type { UpdatePhotoCaptionInput } from "@journiful/shared/schemas";

// Reusable param schemas
const tripIdParamsSchema = z.object({
  id: z.string().uuid({ message: "Invalid trip ID format" }),
});

const photoIdParamsSchema = z.object({
  id: z.string().uuid({ message: "Invalid trip ID format" }),
  photoId: z.string().uuid({ message: "Invalid photo ID format" }),
});

/**
 * Photo Routes
 * Registers all trip photo endpoints
 *
 * Read-only routes (GET) require authentication only.
 * Write routes (POST/PATCH/DELETE) require authentication and complete profile,
 * applied via a scoped plugin with shared preHandler hooks.
 *
 * @param fastify - Fastify instance
 */
export async function photoRoutes(fastify: FastifyInstance) {
  /**
   * GET /
   * List photos for a trip
   * Requires authentication only (not complete profile)
   */
  fastify.get<{ Params: { id: string } }>(
    "/",
    {
      schema: {
        params: tripIdParamsSchema,
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    photoController.getPhotos,
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
     * Upload photos for a trip
     * Note: No body schema for multipart routes
     */
    scope.post<{ Params: { id: string } }>(
      "/",
      {
        schema: {
          params: tripIdParamsSchema,
        },
      },
      photoController.uploadPhotos,
    );

    /**
     * PATCH /:photoId
     * Update photo caption
     */
    scope.patch<{
      Params: { id: string; photoId: string };
      Body: UpdatePhotoCaptionInput;
    }>(
      "/:photoId",
      {
        schema: {
          params: photoIdParamsSchema,
          body: updatePhotoCaptionSchema,
        },
      },
      photoController.updateCaption,
    );

    /**
     * DELETE /:photoId
     * Delete a photo
     */
    scope.delete<{ Params: { id: string; photoId: string } }>(
      "/:photoId",
      {
        schema: {
          params: photoIdParamsSchema,
        },
      },
      photoController.deletePhoto,
    );
  });
}
