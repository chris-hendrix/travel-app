import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { OpenMeteoGeocodingService } from "@/services/geocoding.service.js";

/**
 * Geocoding service plugin
 * Creates an OpenMeteoGeocodingService instance and decorates it
 * on the Fastify instance for use by route handlers.
 */
export default fp(
  async function geocodingServicePlugin(fastify: FastifyInstance) {
    const geocodingService = new OpenMeteoGeocodingService();
    fastify.decorate("geocodingService", geocodingService);
  },
  {
    name: "geocoding-service",
    fastify: "5.x",
    dependencies: ["config"],
  },
);
