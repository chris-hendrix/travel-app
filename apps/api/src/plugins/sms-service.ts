import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { SMSService } from "@/services/sms.service.js";

export default fp(
  async function smsServicePlugin(fastify: FastifyInstance) {
    fastify.decorate("smsService", new SMSService(fastify.log));
  },
  {
    name: "sms-service",
    fastify: "5.x",
    dependencies: ["config"],
  },
);
