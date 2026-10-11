import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { HealthService } from "@/services/health.service.js";
import { testConnection } from "@/config/database.js";
import { readSchemaState } from "@/lib/schema-state.js";

/**
 * Health service plugin
 * Decorates the Fastify instance with the health service
 */
export default fp(
  async function healthServicePlugin(fastify: FastifyInstance) {
    /**
     * The newest migration this database has applied, read from drizzle's own
     * ledger.
     *
     * `max(created_at)` rather than a count: this database is permanently short
     * of the journal — three migrations predate the switch from `db:push` to
     * `migrate` — so a count would call a current database behind forever.
     */
    const newestAppliedMigration = async (): Promise<number | null> => {
      const result = await fastify.db.execute<{ newest: string | null }>(
        sql`SELECT max(created_at)::text AS newest FROM drizzle.__drizzle_migrations`,
      );
      const raw = result.rows[0]?.newest ?? null;
      return raw === null ? null : Number(raw);
    };

    const healthService = new HealthService(testConnection, () =>
      readSchemaState(newestAppliedMigration),
    );
    fastify.decorate("healthService", healthService);
  },
  {
    name: "health-service",
    fastify: "5.x",
    dependencies: ["database"],
  },
);
