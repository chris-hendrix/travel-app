import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { authenticate } from "@/middleware/auth.middleware.js";
import { defaultRateLimitConfig } from "@/middleware/rate-limit.middleware.js";
import { TripNotFoundError } from "@/errors.js";
import { poiCache, trips } from "@/db/schema/index.js";
import { poiSuggestionsResponseSchema } from "@journiful/shared/schemas";
import { groupByCategoryOnly } from "@/services/discover.service.js";

const tripIdParams = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

const discoverQuerySchema = z.object({
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  location: z.string().optional(),
  refresh: z.coerce.boolean().optional(),
});

const convertBodySchema = z.object({
  sourceId: z.string(),
  eventId: z.string().uuid({ message: "Invalid event ID format" }),
});

export async function discoverRoutes(fastify: FastifyInstance) {
  /**
   * GET /trips/:tripId/discover
   * Get POI suggestions for a trip's destination
   * Requires authentication and trip membership
   */
  fastify.get<{ Params: { tripId: string }; Querystring: { lat?: number; lon?: number; location?: string; refresh?: boolean } }>(
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
      const { lat: queryLat, lon: queryLon, location: queryLocation, refresh } = request.query;
      const userId = request.user.sub;

      // Check trip membership
      const isMember = await request.server.permissionsService.isMember(
        userId,
        tripId,
      );
      if (!isMember) {
        throw new TripNotFoundError();
      }

      // Look up trip for fallback values (destination name, coordinates)
      const [trip] = await request.server.db
        .select({
          destination: trips.destination,
          destinationDisplayName: trips.destinationDisplayName,
          destinationLat: trips.destinationLat,
          destinationLon: trips.destinationLon,
        })
        .from(trips)
        .where(eq(trips.id, tripId));

      // Use query params, fall back to trip data
      const lat = queryLat ?? trip?.destinationLat ?? null;
      const lon = queryLon ?? trip?.destinationLon ?? null;
      const location = queryLocation ?? trip?.destinationDisplayName ?? trip?.destination ?? null;

      // If no coordinates at all, return empty response with trip's destination
      if (lat == null || lon == null) {
        return reply.send({
          success: true,
          data: {
            destination: location,
            source: "foursquare" as const,
            categories: groupByCategoryOnly([]),
          },
        });
      }

      // If API key is not configured, serve from cache (if available)
      if (!request.server.config.FOURSQUARE_API_KEY) {
        if (!refresh) {
          const cached = await request.server.db
            .select()
            .from(poiCache)
            .where(eq(poiCache.tripId, tripId));
          if (cached.length > 0) {
            // Delegate to service — it will hit cache and return results
            const result =
              await request.server.discoverService.getDiscoverPOIs(
                tripId,
                lat,
                lon,
                location,
                false,
              );
            return reply.send({ success: true, data: result });
          }
        }
        return reply.status(503).send({
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Discover feature is not configured",
          },
        });
      }

      const result = await request.server.discoverService.getDiscoverPOIs(
        tripId,
        lat,
        lon,
        location,
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
