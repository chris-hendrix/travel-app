import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { BalanceService } from "@/services/balance.service.js";

export default fp(
  async function balanceServicePlugin(fastify: FastifyInstance) {
    const balanceService = new BalanceService(fastify.db);
    fastify.decorate("balanceService", balanceService);
  },
  {
    name: "balance-service",
    fastify: "5.x",
    dependencies: ["database"],
  },
);
