import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { GuestService } from "@/services/guest.service.js";

export default fp(
  async function guestServicePlugin(fastify: FastifyInstance) {
    const guestService = new GuestService(
      fastify.db,
      fastify.permissionsService,
    );
    fastify.decorate("guestService", guestService);
  },
  {
    name: "guest-service",
    fastify: "5.x",
    dependencies: ["database", "permissions-service"],
  },
);
