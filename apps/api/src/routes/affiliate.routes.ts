import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { affiliateController } from "@/controllers/affiliate.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import {
  defaultRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import {
  suggestionsResponseSchema,
  dismissSuggestionSchema,
} from "@journiful/shared/schemas";
import type { DismissSuggestionInput } from "@journiful/shared/schemas";

const tripIdParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

export async function affiliateRoutes(fastify: FastifyInstance) {
  /**
   * GET /trips/:tripId/suggestions
   * Get contextual affiliate suggestions for a trip
   */
  fastify.get<{ Params: { tripId: string } }>(
    "/trips/:tripId/suggestions",
    {
      schema: {
        params: tripIdParamsSchema,
        response: { 200: suggestionsResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    affiliateController.getSuggestions,
  );

  /**
   * POST /trips/:tripId/suggestions/dismiss
   * Dismiss a suggestion so it doesn't reappear
   */
  fastify.post<{ Params: { tripId: string }; Body: DismissSuggestionInput }>(
    "/trips/:tripId/suggestions/dismiss",
    {
      schema: {
        params: tripIdParamsSchema,
        body: dismissSuggestionSchema,
      },
      preHandler: [
        fastify.rateLimit(writeRateLimitConfig),
        authenticate,
        requireCompleteProfile,
      ],
    },
    affiliateController.dismissSuggestion,
  );
}
