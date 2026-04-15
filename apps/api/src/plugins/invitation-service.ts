import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { InvitationService } from "@/services/invitation.service.js";

/**
 * Invitation service plugin
 * Creates an InvitationService instance and decorates it on the Fastify instance
 */
export default fp(
  async function invitationServicePlugin(fastify: FastifyInstance) {
    const invitationService = new InvitationService(
      fastify.db,
      fastify.permissionsService,
      fastify.smsService,
      fastify.notificationService,
      fastify.log,
      fastify.boss ?? null,
      fastify.config.FRONTEND_URL,
    );
    fastify.decorate("invitationService", invitationService);
  },
  {
    name: "invitation-service",
    fastify: "5.x",
    dependencies: [
      "database",
      "permissions-service",
      "sms-service",
      "notification-service",
      "queue",
    ],
  },
);
