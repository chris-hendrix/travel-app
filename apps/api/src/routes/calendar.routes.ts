import type { FastifyInstance } from "fastify";
import { calendarController } from "@/controllers/calendar.controller.js";
import { authenticate } from "@/middleware/auth.middleware.js";
import { writeRateLimitConfig } from "@/middleware/rate-limit.middleware.js";
import {
  calendarTokenParamsSchema,
  calendarExcludedSchema,
  calendarEnableResponseSchema,
  calendarStatusResponseSchema,
  calendarSuccessResponseSchema,
} from "@tripful/shared/schemas";
import type {
  CalendarTokenParams,
  CalendarExcludedInput,
} from "@tripful/shared/schemas";

export async function calendarRoutes(fastify: FastifyInstance) {
  // Public: GET /calendar/:token.ics — ICS feed (token is the auth)
  fastify.get<{ Params: CalendarTokenParams }>(
    "/calendar/:token.ics",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "15 minutes",
          keyGenerator: (request) =>
            (request.params as CalendarTokenParams).token,
        },
      },
      schema: {
        params: calendarTokenParamsSchema,
      },
    },
    calendarController.getFeed,
  );

  // Authenticated calendar management routes
  fastify.register(async (scope) => {
    scope.addHook("preHandler", scope.rateLimit(writeRateLimitConfig));
    scope.addHook("preHandler", authenticate);

    // GET /users/me/calendar — Calendar status
    scope.get(
      "/users/me/calendar",
      {
        schema: {
          response: { 200: calendarStatusResponseSchema },
        },
      },
      calendarController.getStatus,
    );

    // POST /users/me/calendar — Enable calendar sync
    scope.post(
      "/users/me/calendar",
      {
        schema: {
          response: { 200: calendarEnableResponseSchema },
        },
      },
      calendarController.enable,
    );

    // DELETE /users/me/calendar — Disable calendar sync
    scope.delete(
      "/users/me/calendar",
      {
        schema: {
          response: { 200: calendarSuccessResponseSchema },
        },
      },
      calendarController.disable,
    );

    // POST /users/me/calendar/regenerate — Regenerate calendar token
    scope.post(
      "/users/me/calendar/regenerate",
      {
        schema: {
          response: { 200: calendarEnableResponseSchema },
        },
      },
      calendarController.regenerate,
    );

    // PUT /trips/:tripId/members/me/calendar — Toggle trip calendar inclusion
    scope.put<{ Params: { tripId: string }; Body: CalendarExcludedInput }>(
      "/trips/:tripId/members/me/calendar",
      {
        schema: {
          body: calendarExcludedSchema,
          response: { 200: calendarSuccessResponseSchema },
        },
      },
      calendarController.updateTripExclusion,
    );
  });
}
