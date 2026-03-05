import { Pool } from "pg";
import { config } from "dotenv";

config({ path: ".env", quiet: true });

/**
 * Vitest globalSetup — runs ONCE in the main process before all workers start.
 *
 * This is the correct place for one-time cleanup of stale data from previous
 * test runs. Unlike setupFiles (which runs per-worker, racing with parallel
 * threads), globalSetup is guaranteed to complete before any tests execute.
 */
export async function setup(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await pool.query("SELECT 1");
    console.log("✓ Global setup: database connected");

    // Clean up stale data from previous test runs.
    // These tables may contain leftover entries from runs that didn't
    // complete cleanup (e.g., process crashes, timeouts).
    // This runs ONCE before all threads, so there's no race condition.
    try {
      await pool.query("DELETE FROM rate_limit_entries");
    } catch {
      // Table may not exist yet if migrations haven't run
    }

    try {
      await pool.query("DELETE FROM blacklisted_tokens");
    } catch {
      // Table may not exist yet if migrations haven't run
    }

    try {
      await pool.query("DELETE FROM auth_attempts");
    } catch {
      // Table may not exist yet if migrations haven't run
    }

    console.log("✓ Global setup: stale test data cleaned");
  } finally {
    await pool.end();
  }
}
