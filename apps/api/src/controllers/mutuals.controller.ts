import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  GetMutualsQueryInput,
  GetMutualSuggestionsQueryInput,
} from "@journiful/shared/schemas";

/**
 * Mutuals Controller
 * Handles mutual-related HTTP requests
 */
export const mutualsController = {
  /**
   * Get mutuals endpoint
   * Lists all users who share at least one trip with the authenticated user
   *
   * @route GET /api/mutuals
   * @middleware authenticate
   * @param request - Fastify request with optional query filters
   * @param reply - Fastify reply object
   * @returns Paginated list of mutuals
   */
  async getMutuals(
    request: FastifyRequest<{ Querystring: GetMutualsQueryInput }>,
    reply: FastifyReply,
  ) {
    try {
      const { mutualsService } = request.server;
      const userId = request.user.sub;
      const { tripId, search, cursor, limit } = request.query;

      const result = await mutualsService.getMutuals({
        userId,
        ...(tripId !== undefined && { tripId }),
        ...(search !== undefined && { search }),
        ...(cursor !== undefined && { cursor }),
        limit,
      });

      return reply.status(200).send({
        success: true,
        ...result,
      });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        { err: error, userId: request.user.sub },
        "Failed to get mutuals",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get mutuals",
        },
      });
    }
  },

  /**
   * Get mutual suggestions endpoint
   * Lists mutuals NOT already in a specific trip (for invite dialog)
   * Requires organizer role for the target trip
   *
   * @route GET /api/trips/:tripId/mutual-suggestions
   * @middleware authenticate, requireCompleteProfile
   * @param request - Fastify request with tripId param and optional query filters
   * @param reply - Fastify reply object
   * @returns Paginated list of mutual suggestions
   */
  async getMutualSuggestions(
    request: FastifyRequest<{
      Params: { tripId: string };
      Querystring: GetMutualSuggestionsQueryInput;
    }>,
    reply: FastifyReply,
  ) {
    try {
      const { mutualsService } = request.server;
      const userId = request.user.sub;
      const { tripId } = request.params;
      const { search, cursor, limit } = request.query;

      const result = await mutualsService.getMutualSuggestions({
        userId,
        tripId,
        ...(search !== undefined && { search }),
        ...(cursor !== undefined && { cursor }),
        limit,
      });

      return reply.status(200).send({
        success: true,
        ...result,
      });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        {
          err: error,
          userId: request.user.sub,
          tripId: request.params.tripId,
        },
        "Failed to get mutual suggestions",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get mutual suggestions",
        },
      });
    }
  },
};
