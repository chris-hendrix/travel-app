import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { GoogleGeocodingService } from "@/services/geocoding.service.js";

/**
 * Geocoding service plugin
 * Creates a GoogleGeocodingService instance and decorates it
 * on the Fastify instance for use by route handlers.
 */
export default fp(
  async function geocodingServicePlugin(fastify: FastifyInstance) {
    const geocodingService = new GoogleGeocodingService(
      fastify.config.GOOGLE_MAPS_API_KEY,
      fastify.log,
    );
    fastify.decorate("geocodingService", geocodingService);
  },
  {
    name: "geocoding-service",
    fastify: "5.x",
    dependencies: ["config"],
  },
);
