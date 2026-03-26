import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { FlightService } from "@/services/flight.service.js";

export default fp(
  async function flightServicePlugin(fastify: FastifyInstance) {
    const apiKey = fastify.config.AERODATABOX_API_KEY || null;
    const flightService = new FlightService(fastify.db, apiKey);
    fastify.decorate("flightService", flightService);
  },
  {
    name: "flight-service",
    fastify: "5.x",
    dependencies: ["database", "config"],
  },
);
