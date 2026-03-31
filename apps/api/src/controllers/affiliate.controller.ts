import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  DismissSuggestionInput,
  TrackClickInput,
  TrackImpressionsInput,
} from "@journiful/shared/schemas";
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

  async trackClick(
    request: FastifyRequest<{ Body: TrackClickInput }>,
    reply: FastifyReply,
  ) {
    try {
      await request.server.affiliateService.trackClick(
        request.user.sub,
        request.body.tripId,
        request.body.partnerSlug,
        request.body.suggestionType,
      );
      return reply.send({ redirectUrl: request.body.affiliateUrl });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ err: error }, "Failed to track click");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to track click",
        },
      });
    }
  },

  async trackImpressions(
    request: FastifyRequest<{
      Params: { tripId: string };
      Body: TrackImpressionsInput;
    }>,
    reply: FastifyReply,
  ) {
    try {
      await request.server.affiliateService.trackImpressions(
        request.user.sub,
        request.params.tripId,
        request.body.impressions,
      );
      return reply.status(204).send();
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ err: error }, "Failed to track impressions");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to track impressions",
        },
      });
    }
  },
};
