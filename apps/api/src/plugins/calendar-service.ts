import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { CalendarService } from "@/services/calendar.service.js";

export default fp(
  async function calendarServicePlugin(fastify: FastifyInstance) {
    const calendarService = new CalendarService(fastify.db);
    fastify.decorate("calendarService", calendarService);
  },
  {
    name: "calendar-service",
    fastify: "5.x",
    dependencies: ["database"],
  },
);
