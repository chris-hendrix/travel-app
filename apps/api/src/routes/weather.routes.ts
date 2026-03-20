import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { weatherController } from "@/controllers/weather.controller.js";
import { authenticate } from "@/middleware/auth.middleware.js";
import { defaultRateLimitConfig } from "@/middleware/rate-limit.middleware.js";
import { tripWeatherResponseSchema } from "@journiful/shared/schemas";

const tripIdParams = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

/**
 * Weather Routes
 * Registers weather-related endpoints
 *
 * @param fastify - Fastify instance
 */
export async function weatherRoutes(fastify: FastifyInstance) {
  /**
   * GET /trips/:tripId/weather
   * Get weather forecast for a trip's destination
   * Requires authentication and trip membership
   */
  fastify.get<{ Params: { tripId: string } }>(
    "/trips/:tripId/weather",
    {
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
      schema: {
        params: tripIdParams,
        response: {
          200: z.object({
            success: z.literal(true),
            weather: tripWeatherResponseSchema,
          }),
        },
      },
    },
    weatherController.getForecast,
  );
}
