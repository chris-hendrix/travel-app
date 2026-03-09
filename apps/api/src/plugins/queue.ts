import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { PgBoss } from "pg-boss";

/**
 * Queue plugin
 * Decorates the Fastify instance with a pg-boss queue manager.
 * Starts the boss on registration and stops gracefully on close.
 * In test environment, decorates with null to avoid connection pool exhaustion.
 * Set ENABLE_QUEUE_WORKERS=true to override this (e.g. for E2E tests).
 */
export default fp(
  async function queuePlugin(fastify: FastifyInstance) {
    if (
      fastify.config.NODE_ENV === "test" &&
      !process.env.ENABLE_QUEUE_WORKERS
    ) {
      fastify.decorate("boss", null);
      return;
    }

    const boss = new PgBoss({
      connectionString: fastify.config.DATABASE_URL,
      max: 3,
    });

    boss.on("error", (error) => fastify.log.error(error, "pg-boss error"));

    await boss.start();

    fastify.decorate("boss", boss);

    fastify.addHook("onClose", async () => {
      await boss.stop({ graceful: true });
    });
  },
  {
    name: "queue",
    fastify: "5.x",
    dependencies: ["config"],
  },
);
