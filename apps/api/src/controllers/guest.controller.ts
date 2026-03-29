import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateGuestInput,
  UpdateGuestInput,
} from "@journiful/shared/schemas";

export const guestController = {
  async listGuests(
    request: FastifyRequest<{ Params: { tripId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const guests = await request.server.guestService.getGuestsByTrip(
        request.params.tripId,
      );
      return reply.send({ success: true, guests });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ err: error }, "Failed to list guests");
      return reply.status(500).send({
        success: false,
        error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to list guests" },
      });
    }
  },

  async createGuest(
    request: FastifyRequest<{
      Params: { tripId: string };
      Body: CreateGuestInput;
    }>,
    reply: FastifyReply,
  ) {
    try {
      const guest = await request.server.guestService.createGuest(
        request.user.sub,
        request.params.tripId,
        request.body,
      );
      return reply.status(201).send({ success: true, guest });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ err: error }, "Failed to create guest");
      return reply.status(500).send({
        success: false,
        error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to create guest" },
      });
    }
  },

  async updateGuest(
    request: FastifyRequest<{
      Params: { id: string };
      Body: UpdateGuestInput;
    }>,
    reply: FastifyReply,
  ) {
    try {
      const guest = await request.server.guestService.updateGuest(
        request.user.sub,
        request.params.id,
        request.body,
      );
      return reply.send({ success: true, guest });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ err: error }, "Failed to update guest");
      return reply.status(500).send({
        success: false,
        error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to update guest" },
      });
    }
  },

  async deleteGuest(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      await request.server.guestService.deleteGuest(
        request.user.sub,
        request.params.id,
      );
      return reply.send({ success: true });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ err: error }, "Failed to delete guest");
      return reply.status(500).send({
        success: false,
        error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to delete guest" },
      });
    }
  },
};
