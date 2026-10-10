import type { HealthCheckResponse } from "@/types/index.js";
import type { SchemaState } from "@/lib/schema-state.js";

/**
 * Health Service
 * Checks database connectivity and returns system status
 */
export class HealthService {
  constructor(
    private testConnection: () => Promise<boolean>,
    /**
     * Whether the database carries the migrations this build shipped. Injected
     * like `testConnection`, so the readiness decision can be exercised without
     * a database that is actually behind.
     */
    private readSchema: () => Promise<SchemaState>,
  ) {}

  async getStatus(): Promise<HealthCheckResponse> {
    const dbConnected = await this.testConnection();

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      database: dbConnected ? "connected" : "disconnected",
      // Asked only when the database answered: a database that is not there
      // has no schema to be behind, and the probe already fails on the first
      // term.
      migrations: dbConnected ? await this.readSchema() : "unknown",
    };
  }
}
