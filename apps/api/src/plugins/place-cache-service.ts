import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { PlaceCacheService } from "@/services/place-cache.service.js";

/**
 * Place-cache service plugin.
 * Wraps the database in a PlaceCacheService (provider fetcher is wired by
 * Phase 3; until then misses resolve to null) and decorates it on the
 * Fastify instance for the trip/event/accommodation serializers.
 */
export default fp(
  async function placeCacheServicePlugin(fastify: FastifyInstance) {
    const placeCache = new PlaceCacheService(fastify.db, async () => null, fastify.log);
    fastify.decorate("placeCache", placeCache);
  },
  {
    name: "place-cache-service",
    fastify: "5.x",
    dependencies: ["database", "config"],
  },
);
