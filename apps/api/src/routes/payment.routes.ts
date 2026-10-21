import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { paymentController } from "@/controllers/payment.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import { checkBanned } from "@/middleware/account-state.middleware.js";
import {
  defaultRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import {
  createPaymentSchema,
  updatePaymentSchema,
  paymentListResponseSchema,
  paymentResponseSchema,
  successResponseSchema,
} from "@journiful/shared/schemas";
import type {
  CreatePaymentInput,
  UpdatePaymentInput,
} from "@journiful/shared/schemas";

const tripIdParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

const paymentIdParamsSchema = z.object({
  id: z.string().uuid({ message: "Invalid payment ID format" }),
});

export async function paymentRoutes(fastify: FastifyInstance) {
  /**
   * GET /trips/:tripId/payments
   * List payments for a trip
   */
  fastify.get<{ Params: { tripId: string } }>(
    "/trips/:tripId/payments",
    {
      schema: {
        params: tripIdParamsSchema,
        response: { 200: paymentListResponseSchema },
      },
      config: { rateLimit: defaultRateLimitConfig },
      preHandler: [authenticate, checkBanned],
    },
    paymentController.listPayments,
  );

  /**
   * Write routes scope
   */
  fastify.register(async (scope) => {
    scope.addHook("preHandler", authenticate);
    scope.addHook("preHandler", checkBanned);
    scope.addHook("preHandler", requireCompleteProfile);

    /**
     * POST /trips/:tripId/payments
     * Create a new payment
     */
    scope.post<{ Params: { tripId: string }; Body: CreatePaymentInput }>(
      "/trips/:tripId/payments",
      {
        config: { rateLimit: writeRateLimitConfig },
        schema: {
          params: tripIdParamsSchema,
          body: createPaymentSchema,
          response: { 201: paymentResponseSchema },
        },
      },
      paymentController.createPayment,
    );

    /**
     * PUT /payments/:id
     * Update a payment
     */
    scope.put<{ Params: { id: string }; Body: UpdatePaymentInput }>(
      "/payments/:id",
      {
        config: { rateLimit: writeRateLimitConfig },
        schema: {
          params: paymentIdParamsSchema,
          body: updatePaymentSchema,
          response: { 200: paymentResponseSchema },
        },
      },
      paymentController.updatePayment,
    );

    /**
     * DELETE /payments/:id
     * Delete a payment, permanently: settle keeps no deleted rows (`0059`)
     */
    scope.delete<{ Params: { id: string } }>(
      "/payments/:id",
      {
        config: { rateLimit: writeRateLimitConfig },
        schema: {
          params: paymentIdParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      paymentController.deletePayment,
    );

  });
}
