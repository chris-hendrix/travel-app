import type { FastifyRequest, FastifyReply } from "fastify";
import type { FlightLookupRequest } from "@journiful/shared/types";

export const flightController = {
  async lookup(
    request: FastifyRequest<{ Body: FlightLookupRequest }>,
    reply: FastifyReply,
  ) {
    const { flightNumber, date } = request.body;

    try {
      const result = await request.server.flightService.lookupFlight(
        flightNumber,
        date,
      );
      return reply.send({ success: true, ...result });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        { err: error, flightNumber, date },
        "Failed to look up flight",
      );

      const message =
        error instanceof Error ? error.message : "Flight lookup failed";
      return reply.status(500).send({
        success: false,
        error: {
          code: "FLIGHT_LOOKUP_ERROR",
          message,
        },
      });
    }
  },
};
