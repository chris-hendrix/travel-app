import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * The App Review sign-in path, against a built app.
 *
 * The unit test next door (`tests/unit/review-phone-validator.test.ts`) drives
 * the controller in production's shape; this one drives the route, the plugin
 * wiring and the database. What it exists to prove is the reviewer's first
 * sign-in: a number from `REVIEW_PHONES` must not be rejected by the phone
 * validator, because that answer (400 "Invalid phone number format") arrives
 * before the allowlist is consulted and a reviewer who cannot sign in cannot
 * test anything else.
 *
 * `NODE_ENV` stays `test` on purpose: `plugins/queue.ts` starts a real pg-boss
 * instance for anything that is not test, and this file only needs the two
 * variables that decide this path — the fixed-code flag off (production
 * refuses to boot with it on) and `REVIEW_PHONES` set. The `555` escape hatch
 * in `utils/phone.ts` is off with the flag, so the validator is production's.
 *
 * Twilio is stubbed out with dummy credentials: every number asserted here is
 * either rejected by the validator or answered by the allowlist wrapper, and
 * the dummy values are what keeps a regression from reaching the real account.
 */
process.env.ENABLE_FIXED_VERIFICATION_CODE = "false";
process.env.REVIEW_PHONES = "+15550000099,+14155552671";
process.env.TWILIO_ACCOUNT_SID = `AC${"a".repeat(32)}`;
process.env.TWILIO_AUTH_TOKEN = "b".repeat(32);
process.env.TWILIO_VERIFY_SERVICE_SID = `VA${"c".repeat(32)}`;

const { buildApp } = await import("../helpers.js");

/** The number the review notes nominate: synthetic, unassigned, allowlisted. */
const REVIEW_PHONE = "+15550000099";

/** A synthetic number of the same shape that is *not* on the list. */
const UNLISTED_SYNTHETIC = "+15550000098";

describe("POST /api/auth/request-code and /verify-code with the allowlist on", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("answers 200 for an allowlisted number libphonenumber rejects", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/request-code",
      payload: { phoneNumber: REVIEW_PHONE, smsConsent: true },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      success: true,
      message: "Verification code sent",
    });
  });

  it("answers 400 for a synthetic number that is not allowlisted", async () => {
    // The allowlist widens the gate for named numbers only.
    app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/request-code",
      payload: { phoneNumber: UNLISTED_SYNTHETIC, smsConsent: true },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("signs the allowlisted number in with the fixed code", async () => {
    app = await buildApp();

    await app.inject({
      method: "POST",
      url: "/api/auth/request-code",
      payload: { phoneNumber: REVIEW_PHONE, smsConsent: true },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/verify-code",
      payload: { phoneNumber: REVIEW_PHONE, code: "123456", smsConsent: true },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.user.phoneNumber).toBe(REVIEW_PHONE);
  });

  it("refuses any other code for the allowlisted number", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/verify-code",
      payload: { phoneNumber: REVIEW_PHONE, code: "000000", smsConsent: true },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe("INVALID_CODE");
  });
});
