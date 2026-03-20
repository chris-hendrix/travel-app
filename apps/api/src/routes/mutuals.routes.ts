import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { mutualsController } from "@/controllers/mutuals.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import { defaultRateLimitConfig } from "@/middleware/rate-limit.middleware.js";
import {
  getMutualsQuerySchema,
  getMutualSuggestionsQuerySchema,
  getMutualsResponseSchema,
  type GetMutualsQueryInput,
  type GetMutualSuggestionsQueryInput,
} from "@journiful/shared/schemas";

/**
 * Mutuals Routes
 * Registers endpoints for querying users who share trips
 *
 * @param fastify - Fastify instance
 */
export async function mutualsRoutes(fastify: FastifyInstance) {
  /**
   * GET /mutuals
   * List all mutuals for the authenticated user
   * Supports optional tripId filter, search prefix, and cursor pagination
   * Requires authentication only
   */
  fastify.get<{ Querystring: GetMutualsQueryInput }>(
    "/mutuals",
    {
      schema: {
        querystring: getMutualsQuerySchema,
        response: { 200: getMutualsResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
    },
    mutualsController.getMutuals,
  );

  /**
   * GET /trips/:tripId/mutual-suggestions
   * List mutuals NOT already in a specific trip (for invite dialog)
   * Requires authentication and complete profile (organizer-only, checked in service)
   */
  fastify.get<{
    Params: { tripId: string };
    Querystring: GetMutualSuggestionsQueryInput;
  }>(
    "/trips/:tripId/mutual-suggestions",
    {
      schema: {
        params: z.object({
          tripId: z.string().uuid({ message: "Invalid trip ID format" }),
        }),
        querystring: getMutualSuggestionsQuerySchema,
        response: { 200: getMutualsResponseSchema },
      },
      preHandler: [
        fastify.rateLimit(defaultRateLimitConfig),
        authenticate,
        requireCompleteProfile,
      ],
    },
    mutualsController.getMutualSuggestions,
  );
}
