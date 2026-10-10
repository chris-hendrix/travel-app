import type { FastifyRequest, FastifyReply } from "fastify";

export const healthController = {
  async check(request: FastifyRequest, reply: FastifyReply) {
    const health = await request.server.healthService.getStatus();
    return reply.status(200).send(health);
  },

  async live(_request: FastifyRequest, reply: FastifyReply) {
    return reply.status(200).send({ status: "ok" });
  },

  async ready(request: FastifyRequest, reply: FastifyReply) {
    const health = await request.server.healthService.getStatus();
    // Two ways to be unready, and the second is the one that used to pass: a
    // reachable database whose schema is behind this build serves 500s on every
    // route that reads a column the migration adds, while connectivity alone
    // still reads as fine.
    const isReady =
      health.database === "connected" && health.migrations !== "behind";
    return reply.status(isReady ? 200 : 503).send({
      status: isReady ? "ok" : "error",
      timestamp: health.timestamp,
      database: health.database,
      migrations: health.migrations,
    });
  },
};
