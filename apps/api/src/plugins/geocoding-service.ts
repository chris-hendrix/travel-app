import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { NominatimGeocodingService } from "@/services/geocoding.service.js";

/**
 * Geocoding service plugin
 * Creates a NominatimGeocodingService instance and decorates it
 * on the Fastify instance for use by route handlers.
 */
export default fp(
  async function geocodingServicePlugin(fastify: FastifyInstance) {
    const geocodingService = new NominatimGeocodingService(fastify.log);
    fastify.decorate("geocodingService", geocodingService);
  },
  {
    name: "geocoding-service",
    fastify: "5.x",
    dependencies: ["config"],
  },
);
