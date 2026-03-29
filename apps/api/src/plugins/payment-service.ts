import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { PaymentService } from "@/services/payment.service.js";

export default fp(
  async function paymentServicePlugin(fastify: FastifyInstance) {
    const paymentService = new PaymentService(
      fastify.db,
      fastify.permissionsService,
    );
    fastify.decorate("paymentService", paymentService);
  },
  {
    name: "payment-service",
    fastify: "5.x",
    dependencies: ["database", "permissions-service"],
  },
);
