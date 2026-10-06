import { describe, it, expect, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import { users, blacklistedTokens } from "@/db/schema/index.js";
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
 *
 * 3. It refuses a token carrying `impersonating: true`, because such a
 *    token's `sub` is the impersonated user, not the admin holding it.
 *
 * 4. It kills the token that called it. `authenticate` checks a signature and
 *    a blacklist row, not a live account, so a JWT issued before the deletion
 *    would otherwise keep working on every surface that runs only
 *    `authenticate` until it expires — seven days — after the account it
 *    stands for is gone.
 */
describe("DELETE /api/users/me", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    vi.restoreAllMocks();
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

  it("should blacklist the token that deleted the account", async () => {
    app = await buildApp();

    const testUser = await createUser();
    const jti = randomUUID();
    const token = app.jwt.sign({
      sub: testUser.id,
      name: testUser.displayName,
      jti,
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/users/me",
      cookies: { auth_token: token },
      payload: { confirm: "delete" },
    });

    expect(response.statusCode).toBe(200);

    // The write itself, before the behaviour it buys. `expiresAt` has to be a
    // real future instant: `isBlacklisted` does not read it, so a botched
    // seconds/milliseconds conversion would still revoke here and only ever
    // show up as a row the reaper (queues/index.ts, `expires_at < now()`)
    // deletes on its next pass.
    const rows = await db
      .select()
      .from(blacklistedTokens)
      .where(eq(blacklistedTokens.jti, jti));

    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(testUser.id);
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

    // `POST /api/auth/logout` runs `authenticate` and nothing else, so its
    // answer isolates the blacklist: it carries no `checkBanned`, and its
    // handler calls neither `getUserById` (the `deletedAt` filter) nor
    // anything that reads the tombstoned row. A 401 saying "Token has been
    // revoked" can only be the blacklist.
    const probe = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { auth_token: token },
    });

    expect(probe.statusCode).toBe(401);
    expect(JSON.parse(probe.body)).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Token has been revoked" },
    });
  });

  it("should still answer 200 when the blacklist write fails", async () => {
    app = await buildApp();

    const testUser = await createUser();
    const jti = randomUUID();
    const token = app.jwt.sign({
      sub: testUser.id,
      name: testUser.displayName,
      jti,
    });

    // The account is already gone by the time the blacklist is written, so a
    // failure there must not turn a completed deletion into a 500 the caller
    // reads as "not deleted". The write has to be attempted all the same.
    const blacklist = vi
      .spyOn(app.authService, "blacklistToken")
      .mockRejectedValue(new Error("blacklist store unavailable"));

    const response = await app.inject({
      method: "DELETE",
      url: "/api/users/me",
      cookies: { auth_token: token },
      payload: { confirm: "delete" },
    });

    expect(blacklist).toHaveBeenCalledWith(jti, testUser.id, expect.any(Date));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ success: true });

    const after = await db
      .select()
      .from(users)
      .where(eq(users.id, testUser.id))
      .limit(1);

    expect(after[0].deletedAt).toBeInstanceOf(Date);
  });

  it("should leave a second token's /auth/me refused but /auth/logout reachable", async () => {
    app = await buildApp();

    const testUser = await createUser();
    const deletingToken = app.jwt.sign({
      sub: testUser.id,
      name: testUser.displayName,
      jti: randomUUID(),
    });

    await app.inject({
      method: "DELETE",
      url: "/api/users/me",
      cookies: { auth_token: deletingToken },
      payload: { confirm: "delete" },
    });

    // A token the deletion never saw. Both routes run `authenticate` and
    // nothing else, and neither gained a `checkBanned` — deliberately. `/me`
    // is already closed by `getUserById`'s own `deletedAt` filter, and
    // logout has to stay reachable so a session on a device that has just
    // lost its account can still clear its cookie. This test is here so a
    // future tidy-up that adds `checkBanned` to the auth scope has to argue
    // with something.
    const otherToken = app.jwt.sign({
      sub: testUser.id,
      name: testUser.displayName,
      jti: randomUUID(),
    });

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { auth_token: otherToken },
    });
    expect(me.statusCode).toBe(401);

    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { auth_token: otherToken },
    });
    expect(logout.statusCode).toBe(200);
    expect(JSON.parse(logout.body)).toEqual({
      success: true,
      message: "Logged out successfully",
    });
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

  it("should answer 401, not 200, to a repeat on a token that carries a jti", async () => {
    app = await buildApp();

    // The sibling test above signs its token with `tokenFor`, which omits the
    // `jti` claim `authService.generateToken` always mints — and `authenticate`
    // accepts a jti-less token for backward compatibility, so nothing gets
    // blacklisted there. This is the shape a real client holds, and it is the
    // case a retry after a client-side timeout actually meets: the deletion
    // succeeded, the token came back revoked, and `authenticate` stops the
    // repeat before the handler ever sees it.
    const testUser = await createUser();
    const token = app.jwt.sign({
      sub: testUser.id,
      name: testUser.displayName,
      jti: randomUUID(),
    });

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

    // 401 rather than 200, and that is the price of killing the token: the
    // privacy right was satisfied by the first call, and the row below proves
    // the second did not resurrect anything. What the person reads is "your
    // session is over", which is true.
    expect(second.statusCode).toBe(401);
    expect(JSON.parse(second.body)).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Token has been revoked" },
    });

    const after = await db
      .select()
      .from(users)
      .where(eq(users.id, testUser.id));

    expect(after).toHaveLength(1);
    expect(after[0].displayName).toBe(DELETED_DISPLAY_NAME);
    expect(after[0].deletedAt).toBeInstanceOf(Date);
  });

  it("should refuse the delete while an admin is impersonating", async () => {
    app = await buildApp();

    const testUser = await createUser();
    const admin = await createUser({ role: "admin" });

    // Shaped as `adminService.startImpersonation` mints it: `sub` is the
    // impersonated user, `adminId` the admin doing it.
    const token = app.jwt.sign({
      sub: testUser.id,
      name: testUser.displayName,
      adminId: admin.id,
      impersonating: true,
      jti: "impersonation-test",
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/users/me",
      cookies: { auth_token: token },
      payload: { confirm: "delete" },
    });

    expect(response.statusCode).toBe(403);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");

    // The account the admin was looking at has to survive untouched.
    const after = await db
      .select()
      .from(users)
      .where(eq(users.id, testUser.id))
      .limit(1);

    expect(after[0].deletedAt).toBeNull();
    expect(after[0].phoneNumber).toBe(testUser.phoneNumber);
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