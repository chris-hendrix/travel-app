import type { FastifyRequest, FastifyReply } from "fastify";
import type {} from "@/types/index.js";

export const balanceController = {
  async getTripBalances(
    request: FastifyRequest<{ Params: { tripId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const balances = await request.server.balanceService.getTripBalances(
        request.params.tripId,
      );
      return reply.send({ success: true, balances });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ err: error }, "Failed to get trip balances");
      return reply.status(500).send({
        success: false,
        error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to get balances" },
      });
    }
  },

  async getMyBalance(
    request: FastifyRequest<{ Params: { tripId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const result = await request.server.balanceService.getMyBalance(
        request.params.tripId,
        request.user.sub,
      );
      return reply.send({ success: true, ...result });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ err: error }, "Failed to get user balance");
      return reply.status(500).send({
        success: false,
        error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to get balance" },
      });
    }
  },
};
