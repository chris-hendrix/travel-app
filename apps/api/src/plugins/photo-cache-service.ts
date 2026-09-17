import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { PhotoCacheService } from "@/services/photo-cache.service.js";

/**
 * Photo-cache service plugin.
 * Wraps the storage backend (from upload-service) in a PhotoCacheService
 * and decorates it on the Fastify instance for the photo-proxy route.
 */
export default fp(
  async function photoCacheServicePlugin(fastify: FastifyInstance) {
    const photoCache = new PhotoCacheService(fastify.storage, fastify.log);
    fastify.decorate("photoCache", photoCache);
  },
  {
    name: "photo-cache-service",
    fastify: "5.x",
    dependencies: ["upload-service", "config"],
  },
);
