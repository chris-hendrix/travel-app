import type { FastifyRequest, FastifyReply } from "fastify";
import { TripNotFoundError } from "@/errors.js";

/**
 * Weather Controller
 * Handles weather forecast HTTP requests for trips
 */
export const weatherController = {
  /**
   * Get weather forecast for a trip
   *
   * @route GET /api/trips/:tripId/weather
   * @middleware authenticate
   * @param request - Fastify request with tripId param
   * @param reply - Fastify reply object
   * @returns Success response with weather forecast data
   */
  async getForecast(
    request: FastifyRequest<{ Params: { tripId: string } }>,
    reply: FastifyReply,
  ) {
    const { tripId } = request.params;
    const userId = request.user.sub;

    try {
      // Check if user is a member of the trip
      const isMember = await request.server.permissionsService.isMember(
        userId,
        tripId,
      );
      if (!isMember) {
        throw new TripNotFoundError();
      }

      // Get weather forecast via service
      const result = await request.server.weatherService.getForecast(tripId);

      return reply.send({ success: true, weather: result });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error for debugging
      request.log.error(
        { err: error, userId, tripId },
        "Failed to get weather forecast",
      );

      // Return generic error response
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get weather forecast",
        },
      });
    }
  },
};
