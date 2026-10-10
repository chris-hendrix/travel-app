import type { FastifyInstance } from "fastify";
import { buildApp } from "@/app.js";

/**
 * Build a Fastify app instance for testing
 * Uses the shared buildApp() factory with test-specific overrides — and no
 * rate-limit override: the suite runs the configuration production does,
 * `global: true` included. A test that asserts a per-route limit is therefore
 * asserting what ships (routes register theirs as `config.rateLimit`, the form
 * that applies under it).
 */
export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildApp({
    fastify: {
      logger: false, // Disable logging in tests
    },
    disableUnderPressure: true, // Avoid spurious 503s from event loop delays
  });

  await app.ready();

  return app;
}

// Re-export as buildApp for backward compatibility with existing tests
export { buildTestApp as buildApp };
