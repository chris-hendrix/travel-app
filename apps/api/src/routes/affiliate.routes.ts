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
  trackClickSchema,
  trackImpressionsSchema,
} from "@journiful/shared/schemas";
import type {
  DismissSuggestionInput,
  TrackClickInput,
  TrackImpressionsInput,
} from "@journiful/shared/schemas";

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

  /**
   * POST /affiliate/click
   * Track a click on an affiliate suggestion and return the redirect URL
   */
  fastify.post<{ Body: TrackClickInput }>(
    "/affiliate/click",
    {
      schema: {
        body: trackClickSchema,
      },
      preHandler: [fastify.rateLimit(writeRateLimitConfig), authenticate],
    },
    affiliateController.trackClick,
  );

  /**
   * POST /trips/:tripId/suggestions/impressions
   * Batch track impressions for displayed suggestions
   */
  fastify.post<{
    Params: { tripId: string };
    Body: TrackImpressionsInput;
  }>(
    "/trips/:tripId/suggestions/impressions",
    {
      schema: {
        params: tripIdParamsSchema,
        body: trackImpressionsSchema,
      },
      preHandler: [fastify.rateLimit(writeRateLimitConfig), authenticate],
    },
    affiliateController.trackImpressions,
  );
}
