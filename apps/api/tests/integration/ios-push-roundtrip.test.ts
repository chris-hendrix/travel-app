import { describe, it, expect, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";

/**
 * Phase-2 integration gate: a sign-in pass (request-code → verify-code →
 * /auth/me) followed by an `apns` subscription and one `sendToUser`.
 *
 * APNs has no fake key, so the `BadDeviceToken` answer is produced by the
 * injected HTTP request seam the ApnsService already takes. This is about the
 * API's own behaviour; a run against real APNs belongs to the device pass.
 *
 * Env is set before the dynamic imports below because `@/config/env.ts` parses
 * process.env once, at import time.
 */

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
process.env.APNS_KEY_P8 = privateKey.export({
  type: "pkcs8",
  format: "pem",
}) as string;
process.env.APNS_KEY_ID = "ABC123DEFG";
process.env.APNS_TEAM_ID = "JOURNIFUL1";
process.env.APNS_BUNDLE_ID = "com.journiful.app";

const { buildApp } = await import("../helpers.js");
const { db } = await import("@/config/database.js");
const { pushSubscriptions } = await import("@/db/schema/index.js");

describe("iOS push round trip", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("creates the apns row on subscribe and prunes it after one BadDeviceToken attempt", async () => {
    app = await buildApp();
    const phone = generateUniquePhone();

    // --- sign in -----------------------------------------------------
    await app.inject({
      method: "POST",
      url: "/api/auth/request-code",
      payload: { phoneNumber: phone, smsConsent: true },
    });

    const verify = await app.inject({
      method: "POST",
      url: "/api/auth/verify-code",
      payload: { phoneNumber: phone, code: "123456", smsConsent: true },
    });
    expect(verify.statusCode).toBe(200);
    const token = JSON.parse(verify.body).token as string;
    expect(token).toBeTruthy();

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { auth_token: token },
    });
    expect(me.statusCode).toBe(200);
    const userId = JSON.parse(me.body).user.id as string;

    // --- subscribe an apns device ------------------------------------
    const deviceToken = "faketoken";
    const subscribe = await app.inject({
      method: "POST",
      url: "/api/push/subscribe",
      cookies: { auth_token: token },
      payload: { provider: "apns", platform: "ios", token: deviceToken },
    });
    expect(subscribe.statusCode).toBe(201);

    const rows = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].endpoint).toBe(`apns:${deviceToken}`);
    expect(rows[0].provider).toBe("apns");
    expect(rows[0].platform).toBe("ios");

    // --- one APNs attempt, answered BadDeviceToken --------------------
    const attempts: { path: string; apnsTopic?: string }[] = [];
    const pushService = app.pushService as unknown as {
      apnsOpts: { apns: { deps: { request?: unknown } } };
    };
    const deps = pushService.apnsOpts.apns.deps;
    deps.request = async (request: { path: string; headers: Record<string, string> }) => {
      attempts.push({ path: request.path, apnsTopic: request.headers["apns-topic"] });
      return { status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) };
    };

    await app.pushService.sendToUser(userId, {
      title: "New event",
      body: "Dinner at 8",
      url: "/events",
    });

    expect(attempts).toHaveLength(1);
    expect(attempts[0].path).toBe(`/3/device/${deviceToken}`);
    expect(attempts[0].apnsTopic).toBe("com.journiful.app");

    const after = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    expect(after).toHaveLength(0);
  });
});