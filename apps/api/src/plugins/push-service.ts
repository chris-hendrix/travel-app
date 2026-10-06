import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { PushService } from "@/services/push.service.js";
import { ApnsService } from "@/services/apns.service.js";

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
    const config = fastify.config;

    // APNs is optional and independently disabled: a missing or invalid .p8
    // logs and leaves web/FCM push untouched. The prune closure fires later
    // (at send time), by which point `pushService` below is assigned.
    let pushService!: PushService;
    const apns = new ApnsService(
      {
        keyP8: config.APNS_KEY_P8,
        keyId: config.APNS_KEY_ID,
        teamId: config.APNS_TEAM_ID,
        bundleId: config.APNS_BUNDLE_ID,
        sandbox: config.APNS_USE_SANDBOX,
      },
      {
        logger: fastify.log,
        removeSubscription: (endpoint: string) =>
          pushService.removeSubscription(endpoint),
      },
    );

    pushService = new PushService(
      fastify.db,
      fastify.log,
      config.VAPID_PUBLIC_KEY,
      config.VAPID_PRIVATE_KEY,
      config.VAPID_SUBJECT,
      config.FIREBASE_SERVICE_ACCOUNT || undefined,
      { apns },
    );
    fastify.decorate("pushService", pushService);
  },
  {
    name: "push-service",
    fastify: "5.x",
    dependencies: ["database", "config"],
  },
);
