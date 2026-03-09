import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { WeatherService } from "@/services/weather.service.js";

/**
 * Weather service plugin
 * Creates a WeatherService instance and decorates it on the Fastify instance
 */
export default fp(
  async function weatherServicePlugin(fastify: FastifyInstance) {
    const weatherService = new WeatherService(fastify.db, fastify.tripService);
    fastify.decorate("weatherService", weatherService);
  },
  {
    name: "weather-service",
    fastify: "5.x",
    dependencies: ["database", "config", "trip-service"],
  },
);
