import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { AdminService } from "@/services/admin.service.js";

/**
 * Admin service plugin
 * Creates an AdminService instance and decorates it on the Fastify instance
 */
export default fp(
  async function adminServicePlugin(fastify: FastifyInstance) {
    const adminService = new AdminService(fastify.db);
    fastify.decorate("adminService", adminService);
  },
  {
    name: "admin-service",
    fastify: "5.x",
    dependencies: ["database"],
  },
);
