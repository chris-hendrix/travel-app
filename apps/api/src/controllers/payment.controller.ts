import type { FastifyRequest, FastifyReply } from "fastify";
import type {} from "@/types/index.js";
import type {
  CreatePaymentInput,
  UpdatePaymentInput,
} from "@journiful/shared/schemas";

export const paymentController = {
  async listPayments(
    request: FastifyRequest<{ Params: { tripId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const paymentsList = await request.server.paymentService.getPaymentsByTrip(
        request.user.sub,
        request.params.tripId,
      );
      return reply.send({ success: true, payments: paymentsList });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ err: error }, "Failed to list payments");
      return reply.status(500).send({
        success: false,
        error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to list payments" },
      });
    }
  },

  async createPayment(
    request: FastifyRequest<{
      Params: { tripId: string };
      Body: CreatePaymentInput;
    }>,
    reply: FastifyReply,
  ) {
    try {
      const payment = await request.server.paymentService.createPayment(
        request.user.sub,
        request.params.tripId,
        request.body,
      );
      return reply.status(201).send({ success: true, payment });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ err: error }, "Failed to create payment");
      return reply.status(500).send({
        success: false,
        error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to create payment" },
      });
    }
  },

  async updatePayment(
    request: FastifyRequest<{
      Params: { id: string };
      Body: UpdatePaymentInput;
    }>,
    reply: FastifyReply,
  ) {
    try {
      const payment = await request.server.paymentService.updatePayment(
        request.user.sub,
        request.params.id,
        request.body,
      );
      return reply.send({ success: true, payment });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ err: error }, "Failed to update payment");
      return reply.status(500).send({
        success: false,
        error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to update payment" },
      });
    }
  },

  async deletePayment(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      await request.server.paymentService.deletePayment(
        request.user.sub,
        request.params.id,
      );
      return reply.send({ success: true });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ err: error }, "Failed to delete payment");
      return reply.status(500).send({
        success: false,
        error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to delete payment" },
      });
    }
  },
};
