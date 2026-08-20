import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { invitationController } from "@/controllers/invitation.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import { checkBanned } from "@/middleware/admin.middleware.js";
import { writeRateLimitConfig } from "@/middleware/rate-limit.middleware.js";
import {
  createPlaceholderSchema,
  updatePlaceholderSchema,
  successResponseSchema,
} from "@journiful/shared/schemas";

const tripIdParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

const placeholderIdParamsSchema = z.object({
  id: z.string().uuid({ message: "Invalid placeholder ID format" }),
});

const linkPlaceholderBodySchema = z.object({
  targetUserId: z.string().uuid({ message: "Invalid target user ID format" }),
});

export async function placeholderRoutes(fastify: FastifyInstance) {
  // All placeholder routes are write operations (organizer-only via service)
  fastify.register(async (scope) => {
    scope.addHook("preHandler", scope.rateLimit(writeRateLimitConfig));
    scope.addHook("preHandler", authenticate);
    scope.addHook("preHandler", checkBanned);
    scope.addHook("preHandler", requireCompleteProfile);

    scope.post<{ Params: { tripId: string }; Body: { name: string; phoneNumber?: string } }>(
      "/trips/:tripId/placeholders",
      {
        schema: {
          params: tripIdParamsSchema,
          body: createPlaceholderSchema,
        },
      },
      invitationController.createPlaceholder,
    );

    scope.put<{ Params: { id: string }; Body: { name?: string; phoneNumber?: string } }>(
      "/placeholders/:id",
      {
        schema: {
          params: placeholderIdParamsSchema,
          body: updatePlaceholderSchema,
        },
      },
      invitationController.updatePlaceholder,
    );

    scope.delete<{ Params: { id: string } }>(
      "/placeholders/:id",
      {
        schema: {
          params: placeholderIdParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      invitationController.deletePlaceholder,
    );

    scope.post<{ Params: { id: string } }>(
      "/placeholders/:id/invite",
      {
        schema: {
          params: placeholderIdParamsSchema,
        },
      },
      invitationController.invitePlaceholder,
    );

    scope.post<{ Params: { id: string }; Body: { targetUserId: string } }>(
      "/placeholders/:id/link",
      {
        schema: {
          params: placeholderIdParamsSchema,
          body: linkPlaceholderBodySchema,
        },
      },
      invitationController.linkPlaceholder,
    );
  });
}
