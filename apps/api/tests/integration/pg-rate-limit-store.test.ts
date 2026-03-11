import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { db } from "@/config/database.js";
import { sql } from "drizzle-orm";
import { createPgRateLimitStoreClass } from "@/plugins/pg-rate-limit-store.js";

describe("PG Rate Limit Store Integration", () => {
  let app: FastifyInstance;
  const testKeyPrefix = `integration-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeEach(async () => {
    // Clean up rate limit entries
    await db.execute(
      sql`DELETE FROM rate_limit_entries WHERE key LIKE ${testKeyPrefix + "%"}`,
    );

    app = Fastify({ logger: false });
    const PgStore = createPgRateLimitStoreClass(db);

    await app.register(rateLimit, {
      global: false,
      store: PgStore,
    });

    app.get(
      "/test",
      {
        config: {
          rateLimit: {
            max: 3,
            timeWindow: 60000,
            keyGenerator: () => `${testKeyPrefix}-test`,
          },
        },
      },
      async () => ({ ok: true }),
    );

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await db.execute(
      sql`DELETE FROM rate_limit_entries WHERE key LIKE ${testKeyPrefix + "%"}`,
    );
  });

  it("should allow requests within rate limit", async () => {
    for (let i = 0; i < 3; i++) {
      const response = await app.inject({
        method: "GET",
        url: "/test",
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({ ok: true });
    }
  });

  it("should return 429 when rate limit exceeded", async () => {
    // Exhaust the limit (3 requests)
    for (let i = 0; i < 3; i++) {
      const response = await app.inject({
        method: "GET",
        url: "/test",
      });
      expect(response.statusCode).toBe(200);
    }

    // 4th request should be rate limited
    const response = await app.inject({
      method: "GET",
      url: "/test",
    });
    expect(response.statusCode).toBe(429);
  });

  it("should include rate limit headers", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/test",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-ratelimit-limit"]).toBeDefined();
    expect(response.headers["x-ratelimit-remaining"]).toBeDefined();
    expect(response.headers["x-ratelimit-reset"]).toBeDefined();
  });
});
