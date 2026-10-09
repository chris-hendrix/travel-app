import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { UserService } from "@/services/user.service.js";

/**
 * User service plugin
 * Creates a UserService instance and decorates it on the Fastify instance
 */
export default fp(
  async function userServicePlugin(fastify: FastifyInstance) {
    const userService = new UserService(fastify.db);
    fastify.decorate("userService", userService);
  },
  {
    name: "user-service",
    fastify: "5.x",
    dependencies: ["database"],
  },
);
