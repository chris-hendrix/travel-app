import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { AffiliateService } from "@/services/affiliate.service.js";

export default fp(
  async function affiliateServicePlugin(fastify: FastifyInstance) {
    const affiliateService = new AffiliateService(
      fastify.db,
      fastify.permissionsService,
    );
    fastify.decorate("affiliateService", affiliateService);
  },
  {
    name: "affiliate-service",
    fastify: "5.x",
    dependencies: ["database", "permissions-service"],
  },
);
