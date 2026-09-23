import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  CalendarTokenParams,
  CalendarExcludedInput,
} from "@journiful/shared/schemas";
import { env } from "@/config/env.js";

/**
 * The feed's URL, as the thing a calendar app is handed.
 *
 * Built from the server-owned PUBLIC_API_ORIGIN so a client-controlled
 * Host header can never redirect the subscription at an attacker host.
 * In development, where no public origin is configured, it falls back to
 * the request host so local calendar apps still get a reachable URL.
 *
 * `host`, not `hostname`: `hostname` is the host without the port, so
 * everywhere the API is not on 80 or 443 — which is every development
 * machine — this handed out `webcal://localhost/api/calendar/…` for a
 * server listening on 8000. Nothing consumed it until the profile
 * screen grew buttons that open it.
 */
function buildWebcalUrl(request: FastifyRequest, token: string): string {
  if (env.PUBLIC_API_ORIGIN) {
    return `webcal://${new URL(env.PUBLIC_API_ORIGIN).host}/api/calendar/${token}.ics`;
  }
  // Development fallback only: PUBLIC_API_ORIGIN is unset, so there is no
  // configured origin to use and the request host is the best available.
  return `webcal://${request.host}/api/calendar/${token}.ics`;
}

export const calendarController = {
  async getFeed(
    request: FastifyRequest<{ Params: CalendarTokenParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { token } = request.params;
    const { calendarService } = request.server;

    const user = await calendarService.getUserByCalendarToken(token);
    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: "Calendar feed not found" },
      });
    }

    const tripsWithEvents = await calendarService.getCalendarTripsAndEvents(
      user.id,
    );
    const icsContent = calendarService.generateIcsFeed(tripsWithEvents);

    return reply
      .header("Content-Type", "text/calendar; charset=utf-8")
      .header("Cache-Control", "no-cache")
      .send(icsContent);
  },

  async getStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user.sub;
    const { calendarService } = request.server;

    const token = await calendarService.getCalendarToken(userId);

    return reply.send({
      success: true,
      enabled: token !== null,
      ...(token ? { calendarUrl: buildWebcalUrl(request, token) } : {}),
    });
  },

  async enable(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user.sub;
    const { calendarService } = request.server;

    const token = await calendarService.enableCalendar(userId);

    return reply.send({
      success: true,
      calendarUrl: buildWebcalUrl(request, token),
      calendarToken: token,
    });
  },

  async disable(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user.sub;
    const { calendarService } = request.server;

    await calendarService.disableCalendar(userId);

    return reply.send({ success: true });
  },

  async regenerate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user.sub;
    const { calendarService } = request.server;

    const token = await calendarService.regenerateCalendar(userId);

    return reply.send({
      success: true,
      calendarUrl: buildWebcalUrl(request, token),
      calendarToken: token,
    });
  },

  async updateTripExclusion(
    request: FastifyRequest<{
      Params: { tripId: string };
      Body: CalendarExcludedInput;
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user.sub;
    const { tripId } = request.params;
    const { excluded } = request.body;
    const { calendarService } = request.server;

    await calendarService.updateTripCalendarExclusion(userId, tripId, excluded);

    return reply.send({ success: true });
  },
};
