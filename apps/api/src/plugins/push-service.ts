import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { PushService } from "@/services/push.service.js";

/**
 * Push service plugin
 * Creates a PushService instance and decorates it on the Fastify instance.
 * Configures web-push with VAPID keys from environment.
 *
 * @depends database - Drizzle ORM instance for subscription queries
 * @depends config - Environment configuration with VAPID keys
 */
export default fp(
  async function pushServicePlugin(fastify: FastifyInstance) {
    const pushService = new PushService(
      fastify.db,
      fastify.log,
      fastify.config.VAPID_PUBLIC_KEY,
      fastify.config.VAPID_PRIVATE_KEY,
      fastify.config.VAPID_SUBJECT,
    );
    fastify.decorate("pushService", pushService);
  },
  {
    name: "push-service",
    fastify: "5.x",
    dependencies: ["database", "config"],
  },
);
