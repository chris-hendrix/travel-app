import { describe, it, expect, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users } from "@/db/schema/index.js";
import { userRoutes } from "@/routes/user.routes.js";
import { writeRateLimitConfig } from "@/middleware/rate-limit.middleware.js";
import { DELETED_DISPLAY_NAME } from "@/services/user.service.js";
import { eq } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";

/**
 * `DELETE /api/users/me` — account deletion.
 *
 * Two things about this route are deliberately unusual and are asserted here
 * so a future edit cannot quietly undo them:
 *
 * 1. It carries no `checkBanned`. Every other route in `userRoutes` does, but
 *    that hook has no per-route opt-out, so deletion gets its own sibling
 *    scope. App Store Review Guideline 5.1.1(v) requires account deletion to
 *    stay available to every account holder; refusing it to a *suspended*
 *    account is the kind of thing a reviewer reads as a violation. The ban
 *    survives the deletion because the row is anonymized, not dropped.
 *
 * 2. It answers 200 for an already-tombstoned account (a repeat call). The
 *    requirement is that the door works, not that it complains.
 */
describe("DELETE /api/users/me", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  /** Insert a fresh user and return it. */
  async function createUser(overrides: Record<string, unknown> = {}) {
    const result = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: "Test User",
        timezone: "UTC",
        ...overrides,
      })
      .returning();
    return result[0];
  }

  function tokenFor(app: FastifyInstance, userId: string, name: string) {
    return app.jwt.sign({ sub: userId, name });
  }

  it("should return 200 and anonymize the account", async () => {
    app = await buildApp();

    const testUser = await createUser();
    const token = tokenFor(app, testUser.id, testUser.displayName);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/users/me",
      cookies: { auth_token: token },
      payload: { confirm: "delete" },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body).toEqual({ success: true });

    const after = await db
      .select()
      .from(users)
      .where(eq(users.id, testUser.id))
      .limit(1);

    expect(after).toHaveLength(1);
    expect(after[0].displayName).toBe(DELETED_DISPLAY_NAME);
    expect(after[0].phoneNumber).toBe(`deleted:${testUser.id}`);
    expect(after[0].deletedAt).toBeInstanceOf(Date);
  });

  it("should require authentication", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "DELETE",
      url: "/api/users/me",
      payload: { confirm: "delete" },
    });

    expect(response.statusCode).toBe(401);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("should reject a call without the confirm guard", async () => {
    app = await buildApp();

    const testUser = await createUser();
    const token = tokenFor(app, testUser.id, testUser.displayName);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/users/me",
      cookies: { auth_token: token },
      payload: {},
    });

    expect(response.statusCode).toBe(400);

    // The account must survive a mis-shaped call.
    const after = await db
      .select()
      .from(users)
      .where(eq(users.id, testUser.id))
      .limit(1);

    expect(after[0].deletedAt).toBeNull();
  });

  it("should be covered by the write rate limit", async () => {
    // Deliberately not driven through `buildApp`. Its rate-limit store is the
    // shared Postgres one, so burning a quota there is load-sensitive and
    // flakes under a parallel run. This probe registers the same route module
    // against @fastify/rate-limit's default in-memory store, so the quota is
    // private to this test and the assertion is about the hook being wired,
    // not about the shared store's state.
    //
    // The write limiter is a preHandler that runs *before* `authenticate`, so
    // the quota is spent whether or not the request authenticates.
    const probe = Fastify({ logger: false });
    probe.setValidatorCompiler(validatorCompiler);
    probe.setSerializerCompiler(serializerCompiler);
    await probe.register(rateLimit, { global: false });
    await probe.register(userRoutes, { prefix: "/api/users" });
    await probe.ready();

    try {
      let last = await probe.inject({
        method: "DELETE",
        url: "/api/users/me",
        payload: { confirm: "delete" },
      });
      // The limiter is in play but under its quota: the request falls through
      // to `authenticate`, which 401s on the probe app's missing JWT setup.
      expect(last.statusCode).toBe(401);

      for (let i = 0; i < writeRateLimitConfig.max; i++) {
        last = await probe.inject({
          method: "DELETE",
          url: "/api/users/me",
          payload: { confirm: "delete" },
        });
      }

      // The quota is spent; the route answers 429 rather than falling through.
      expect(last.statusCode).toBe(429);
    } finally {
      await probe.close();
    }
  });

  it("should let a banned user delete their own account", async () => {
    app = await buildApp();

    const testUser = await createUser({ status: "banned" });
    const token = tokenFor(app, testUser.id, testUser.displayName);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/users/me",
      cookies: { auth_token: token },
      payload: { confirm: "delete" },
    });

    // 200, not 403 — Guideline 5.1.1(v) requires deletion to stay available
    // to every account holder. The ban survives in the anonymized row.
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body).toEqual({ success: true });

    const after = await db
      .select()
      .from(users)
      .where(eq(users.id, testUser.id))
      .limit(1);

    expect(after[0].displayName).toBe(DELETED_DISPLAY_NAME);
    expect(after[0].deletedAt).toBeInstanceOf(Date);
  });

  it("should still delete an already-deleted account (idempotent repeat)", async () => {
    app = await buildApp();

    const testUser = await createUser();
    const token = tokenFor(app, testUser.id, testUser.displayName);

    const first = await app.inject({
      method: "DELETE",
      url: "/api/users/me",
      cookies: { auth_token: token },
      payload: { confirm: "delete" },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "DELETE",
      url: "/api/users/me",
      cookies: { auth_token: token },
      payload: { confirm: "delete" },
    });
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body)).toEqual({ success: true });
  });

  it("should appear in the OpenAPI spec", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/docs/json",
    });

    expect(response.statusCode).toBe(200);

    const spec = JSON.parse(response.body);
    const path =
      spec.paths["/api/users/me"] || spec.paths["/api/users/me/"];
    expect(path).toBeDefined();
    expect(path.delete).toBeDefined();
  });
});