import type { FastifyRequest, FastifyReply } from "fastify";
import type { DismissSuggestionInput } from "@journiful/shared/schemas";
import type {} from "@/types/index.js";

export const affiliateController = {
  async getSuggestions(
    request: FastifyRequest<{ Params: { tripId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const suggestions = await request.server.affiliateService.getSuggestions(
        request.user.sub,
        request.params.tripId,
      );
      return reply.send({ success: true, suggestions });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ err: error }, "Failed to get suggestions");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get suggestions",
        },
      });
    }
  },

  async dismissSuggestion(
    request: FastifyRequest<{
      Params: { tripId: string };
      Body: DismissSuggestionInput;
    }>,
    reply: FastifyReply,
  ) {
    try {
      await request.server.affiliateService.dismissSuggestion(
        request.user.sub,
        request.params.tripId,
        request.body.suggestionType,
        request.body.suggestionKey,
      );
      return reply.status(204).send();
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ err: error }, "Failed to dismiss suggestion");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to dismiss suggestion",
        },
      });
    }
  },
};
