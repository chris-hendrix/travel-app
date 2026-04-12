import type { FastifyInstance } from "fastify";
import { authenticate } from "@/middleware/auth.middleware.js";
import { checkBanned } from "@/middleware/admin.middleware.js";
import {
  defaultRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  vapidPublicKeyResponseSchema,
  type PushSubscribeInput,
  type PushUnsubscribeInput,
} from "@journiful/shared/schemas";

/**
 * Push Notification Routes
 * Manages push subscription lifecycle and VAPID key retrieval
 *
 * @param fastify - Fastify instance
 */
export async function pushRoutes(fastify: FastifyInstance) {
  /**
   * GET /push/vapid-public-key
   * Returns the VAPID public key (unauthenticated — needed before login)
   */
  fastify.get(
    "/push/vapid-public-key",
    {
      schema: {
        response: { 200: vapidPublicKeyResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig)],
    },
    async () => {
      return { publicKey: fastify.config.VAPID_PUBLIC_KEY };
    },
  );

  /**
   * POST /push/subscribe
   * Save or update a push subscription for the authenticated user
   */
  fastify.post<{ Body: PushSubscribeInput }>(
    "/push/subscribe",
    {
      schema: {
        body: pushSubscribeSchema,
      },
      preHandler: [fastify.rateLimit(writeRateLimitConfig), authenticate, checkBanned],
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const { endpoint, keys, userAgent } = request.body;
      await fastify.pushService.addSubscription(
        userId,
        { endpoint, keys },
        userAgent,
      );
      return reply.status(201).send({ success: true });
    },
  );

  /**
   * DELETE /push/subscribe
   * Remove a push subscription by endpoint for the authenticated user
   */
  fastify.delete<{ Body: PushUnsubscribeInput }>(
    "/push/subscribe",
    {
      schema: {
        body: pushUnsubscribeSchema,
      },
      preHandler: [fastify.rateLimit(writeRateLimitConfig), authenticate, checkBanned],
    },
    async (request) => {
      const { endpoint } = request.body;
      await fastify.pushService.removeSubscription(endpoint, request.user.sub);
      return { success: true };
    },
  );
}
