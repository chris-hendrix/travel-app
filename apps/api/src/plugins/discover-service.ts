import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { DiscoverService } from "@/services/discover.service.js";

/**
 * Discover service plugin
 * Creates a DiscoverService instance and decorates it on the Fastify instance
 */
export default fp(
  async function discoverServicePlugin(fastify: FastifyInstance) {
    const key = fastify.config.FOURSQUARE_API_KEY;
    const discoverService = new DiscoverService(fastify.db, key, fastify.log);
    fastify.decorate("discoverService", discoverService);
  },
  { name: "discover-service", fastify: "5.x", dependencies: ["database", "config"] },
);
