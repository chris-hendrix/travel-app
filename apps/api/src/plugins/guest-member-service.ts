import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { GuestMemberService } from "@/services/guest-member.service.js";

/**
 * Guest member service plugin
 * Creates a GuestMemberService instance and decorates it on the Fastify instance
 */
export default fp(
  async function guestMemberServicePlugin(fastify: FastifyInstance) {
    const guestMemberService = new GuestMemberService(
      fastify.db,
      fastify.permissionsService,
    );
    fastify.decorate("guestMemberService", guestMemberService);
  },
  {
    name: "guest-member-service",
    fastify: "5.x",
    dependencies: ["database", "permissions-service"],
  },
);
