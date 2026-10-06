import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { ModerationService } from "@/services/moderation.service.js";

/**
 * Moderation service plugin
 * Creates a ModerationService instance and decorates it on the Fastify instance
 */
export default fp(
  async function moderationServicePlugin(fastify: FastifyInstance) {
    const moderationService = new ModerationService(fastify.db);
    fastify.decorate("moderationService", moderationService);
  },
  {
    name: "moderation-service",
    fastify: "5.x",
    dependencies: ["database"],
  },
);
