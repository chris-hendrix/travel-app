import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { balanceController } from "@/controllers/balance.controller.js";
import { authenticate } from "@/middleware/auth.middleware.js";
import { checkBanned } from "@/middleware/admin.middleware.js";
import { defaultRateLimitConfig } from "@/middleware/rate-limit.middleware.js";
import {
  balanceResponseSchema,
  myBalanceResponseSchema,
} from "@journiful/shared/schemas";

const tripIdParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

export async function balanceRoutes(fastify: FastifyInstance) {
  /**
   * GET /trips/:tripId/balances
   * Get simplified balances for a trip
   */
  fastify.get<{ Params: { tripId: string } }>(
    "/trips/:tripId/balances",
    {
      schema: {
        params: tripIdParamsSchema,
        response: { 200: balanceResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate, checkBanned],
    },
    balanceController.getTripBalances,
  );

  /**
   * GET /trips/:tripId/balances/me
   * Get current user's net balance for a trip
   */
  fastify.get<{ Params: { tripId: string } }>(
    "/trips/:tripId/balances/me",
    {
      schema: {
        params: tripIdParamsSchema,
        response: { 200: myBalanceResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate, checkBanned],
    },
    balanceController.getMyBalance,
  );
}
