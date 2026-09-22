import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  CalendarTokenParams,
  CalendarExcludedInput,
} from "@journiful/shared/schemas";

/**
 * The feed's URL, as the thing a calendar app is handed.
 *
 * `host`, not `hostname`: `hostname` is the host without the port, so
 * everywhere the API is not on 80 or 443 — which is every development
 * machine — this handed out `webcal://localhost/api/calendar/…` for a
 * server listening on 8000. Nothing consumed it until the profile
 * screen grew buttons that open it.
 */
function buildWebcalUrl(request: FastifyRequest, token: string): string {
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
