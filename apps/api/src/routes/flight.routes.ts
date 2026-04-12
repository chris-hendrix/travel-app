import type { FastifyInstance } from "fastify";
import { flightController } from "@/controllers/flight.controller.js";
import { authenticate } from "@/middleware/auth.middleware.js";
import { checkBanned } from "@/middleware/admin.middleware.js";
import { writeRateLimitConfig } from "@/middleware/rate-limit.middleware.js";
import { flightLookupRequestSchema } from "@journiful/shared/schemas";

export async function flightRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { flightNumber: string; date: string } }>(
    "/flights/lookup",
    {
      preHandler: [fastify.rateLimit(writeRateLimitConfig), authenticate, checkBanned],
      schema: {
        body: flightLookupRequestSchema,
      },
    },
    flightController.lookup,
  );
}
