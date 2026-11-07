import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { SavedPlaceService } from "@/services/saved-place.service.js";

/**
 * Saved place service plugin
 * Creates a SavedPlaceService instance and decorates it on the Fastify instance
 */
export default fp(
  async function savedPlaceServicePlugin(fastify: FastifyInstance) {
    const savedPlaceService = new SavedPlaceService(
      fastify.db,
      fastify.permissionsService,
    );
    fastify.decorate("savedPlaceService", savedPlaceService);
  },
  {
    name: "saved-place-service",
    fastify: "5.x",
    dependencies: ["database", "permissions-service"],
  },
);
