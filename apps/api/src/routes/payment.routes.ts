import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { paymentController } from "@/controllers/payment.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import { checkBanned } from "@/middleware/admin.middleware.js";
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

const listPaymentsQuerySchema = z.object({
  includeDeleted: z
    .string()
    .transform((val) => val === "true")
    .optional(),
});

export async function paymentRoutes(fastify: FastifyInstance) {
  /**
   * GET /trips/:tripId/payments
   * List payments for a trip
   */
  fastify.get<{
    Params: { tripId: string };
    Querystring: { includeDeleted?: boolean };
  }>(
    "/trips/:tripId/payments",
    {
      schema: {
        params: tripIdParamsSchema,
        querystring: listPaymentsQuerySchema,
        response: { 200: paymentListResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate, checkBanned],
    },
    paymentController.listPayments,
  );

  /**
   * Write routes scope
   */
  fastify.register(async (scope) => {
    scope.addHook("preHandler", scope.rateLimit(writeRateLimitConfig));
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
     * Soft delete a payment
     */
    scope.delete<{ Params: { id: string } }>(
      "/payments/:id",
      {
        schema: {
          params: paymentIdParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      paymentController.deletePayment,
    );

    /**
     * POST /payments/:id/restore
     * Restore a soft-deleted payment (organizer only)
     */
    scope.post<{ Params: { id: string } }>(
      "/payments/:id/restore",
      {
        schema: {
          params: paymentIdParamsSchema,
          response: { 200: paymentResponseSchema },
        },
      },
      paymentController.restorePayment,
    );
  });
}
