import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { CachedGeocodingService, GoogleGeocodingService, type IGeocodingService } from "@/services/geocoding.service.js";

/**
 * Geocoding service plugin
 * Creates a GoogleGeocodingService instance and decorates it
 * on the Fastify instance for use by route handlers.
 */
export default fp(
  async function geocodingServicePlugin(fastify: FastifyInstance) {
    const inner = new GoogleGeocodingService(
      fastify.config.GOOGLE_MAPS_API_KEY,
      fastify.log,
    );
    // GEOCODING_STUB short-circuits ABOVE the cache: in stub mode wire the raw
    // inner service so stub behavior is unchanged and stub data never pollutes
    // the geocode_cache table.
    const geocodingService: IGeocodingService =
      process.env.GEOCODING_STUB === "true"
        ? inner
        : new CachedGeocodingService(fastify.db, inner, fastify.log);
    fastify.decorate("geocodingService", geocodingService);
  },
  {
    name: "geocoding-service",
    fastify: "5.x",
    dependencies: ["config"],
  },
);
