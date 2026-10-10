import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { healthController } from "@/controllers/health.controller.js";

const healthResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
  database: z.string(),
  migrations: z.enum(["current", "behind", "unknown"]),
});

const liveResponseSchema = z.object({
  status: z.string(),
});

const readyResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
  database: z.string(),
  // Named in the schema because Fastify's serializer drops what it does not
  // find there: a field the probe reports but the schema omits would vanish on
  // the wire, which is how a readiness signal goes missing without a test
  // failing.
  migrations: z.enum(["current", "behind", "unknown"]),
});

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/",
    { schema: { response: { 200: healthResponseSchema } } },
    healthController.check,
  );
  fastify.get(
    "/live",
    { schema: { response: { 200: liveResponseSchema } } },
    healthController.live,
  );
  fastify.get(
    "/ready",
    { schema: { response: { 200: readyResponseSchema } } },
    healthController.ready,
  );
}
