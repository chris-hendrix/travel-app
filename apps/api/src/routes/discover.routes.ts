import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "@/middleware/auth.middleware.js";
import { defaultRateLimitConfig } from "@/middleware/rate-limit.middleware.js";
import { TripNotFoundError } from "@/errors.js";
import { poiSuggestionsResponseSchema } from "@journiful/shared/schemas";

const tripIdParams = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

const discoverQuerySchema = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  location: z.string().optional(),
  refresh: z.coerce.boolean().optional(),
});

const convertBodySchema = z.object({
  sourceId: z.string(),
  eventId: z.string(),
});

export async function discoverRoutes(fastify: FastifyInstance) {
  /**
   * GET /trips/:tripId/discover
   * Get POI suggestions for a trip's destination
   * Requires authentication and trip membership
   */
  fastify.get<{ Params: { tripId: string }; Querystring: { lat: number; lon: number; location?: string; refresh?: boolean } }>(
    "/trips/:tripId/discover",
    {
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
      schema: {
        params: tripIdParams,
        querystring: discoverQuerySchema,
        response: {
          200: z.object({
            success: z.literal(true),
            data: poiSuggestionsResponseSchema,
          }),
        },
      },
    },
    async (request, reply) => {
      const { tripId } = request.params;
      const { lat, lon, location, refresh } = request.query;
      const userId = request.user.sub;

      // Check FOURSQUARE_API_KEY is configured
      if (!request.server.config.FOURSQUARE_API_KEY) {
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Discover feature is not configured",
          },
        });
      }

      // Check trip membership
      const isMember = await request.server.permissionsService.isMember(
        userId,
        tripId,
      );
      if (!isMember) {
        throw new TripNotFoundError();
      }

      const result = await request.server.discoverService.getDiscoverPOIs(
        tripId,
        lat,
        lon,
        location ?? null,
        refresh,
      );

      return reply.send({ success: true, data: result });
    },
  );

  /**
   * PATCH /trips/:tripId/discover/convert
   * Mark a POI as converted to an event
   * Requires authentication and trip membership
   */
  fastify.patch<{ Params: { tripId: string }; Body: { sourceId: string; eventId: string } }>(
    "/trips/:tripId/discover/convert",
    {
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate],
      schema: {
        params: tripIdParams,
        body: convertBodySchema,
        response: {
          200: z.object({
            success: z.literal(true),
          }),
        },
      },
    },
    async (request, reply) => {
      const { tripId } = request.params;
      const { sourceId, eventId } = request.body;
      const userId = request.user.sub;

      // Check trip membership
      const isMember = await request.server.permissionsService.isMember(
        userId,
        tripId,
      );
      if (!isMember) {
        throw new TripNotFoundError();
      }

      await request.server.discoverService.convertPOI(tripId, sourceId, eventId);

      return reply.send({ success: true });
    },
  );
}
