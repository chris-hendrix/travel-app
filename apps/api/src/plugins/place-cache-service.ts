import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { PlaceCacheService } from "@/services/place-cache.service.js";
import { fetchPlaceDetails } from "@/services/places.service.js";
import type { CachedPlaceDetails } from "@journiful/shared/types";

/**
 * Place-cache service plugin.
 * Wraps the database in a PlaceCacheService whose miss fetcher calls the
 * single Google Places caller (places.service `fetchPlaceDetails`) and
 * normalizes the result into our cached snapshot. Without an API key, or
 * when Google is unreachable, misses resolve to null so reads degrade to
 * the stored text column.
 */
export default fp(
  async function placeCacheServicePlugin(fastify: FastifyInstance) {
    const placeCache = new PlaceCacheService(
      fastify.db,
      async (provider, placeId): Promise<CachedPlaceDetails | null> => {
        if (provider !== "google") {
          return null;
        }
        const apiKey = fastify.config.GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
          return null;
        }
        try {
          const details = await fetchPlaceDetails({
            placeId,
            sessionToken: randomUUID(),
            apiKey,
          });
          return { v: 1 as const, ...details };
        } catch {
          return null;
        }
      },
      fastify.log,
    );
    fastify.decorate("placeCache", placeCache);
  },
  {
    name: "place-cache-service",
    fastify: "5.x",
    dependencies: ["database", "config"],
  },
);
