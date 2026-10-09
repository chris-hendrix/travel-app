import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import { requestCodeSchema } from "@journiful/shared/schemas";
import type { RequestCodeInput } from "@journiful/shared/schemas";
import type { IVerificationService } from "@/services/verification.service.js";

/**
 * The App Review allowlist has to be part of the validator's decision.
 *
 * This file runs the production shape in a test process: `REVIEW_PHONES` is
 * set and the fixed-code flag is off — the flag is what production refuses to
 * start with (`config/env.ts`), and turning it off is also what disables the
 * `555` escape hatch in `utils/phone.ts`. What is left is the validator gate a
 * production `POST /auth/request-code` meets, which is why the numbers the
 * review notes nominate are the synthetic `+1555…` kind.
 *
 * `+15550000099` is invalid on purpose: `555` is not an area code, so
 * libphonenumber rejects it and, without the allowlist branch, the controller
 * answers 400 `VALIDATION_ERROR` *before*
 * `ReviewAllowlistVerificationService` is consulted. That is an App Review
 * rejection — the reviewer never reaches a signed-in state to test anything
 * else — so the assertion that matters is the controller's, not the wrapper's.
 *
 * The environment is assigned before the modules that read it are imported:
 * `config/env.ts` parses `process.env` once, at module load. `isolate: true`
 * gives this file its own module registry and its own environment, so these
 * values cannot reach another test file. `apps/api/.env` carries
 * `ENABLE_FIXED_VERIFICATION_CODE=true` for development, and a value already in
 * `process.env` wins over dotenv's.
 */
process.env.NODE_ENV = "production";
process.env.ENABLE_FIXED_VERIFICATION_CODE = "false";
process.env.REVIEW_PHONES = "+15550000099,+1 (415) 555-2671";
// With the flag off the plugin builds the real Twilio service, which needs the
// three variables to exist. Nothing in this file calls it: every number
// asserted here is answered by the allowlist before the wrapped service is
// reached, and the one place a call would happen is asserted not to.
process.env.TWILIO_ACCOUNT_SID = `AC${"a".repeat(32)}`;
process.env.TWILIO_AUTH_TOKEN = "b".repeat(32);
process.env.TWILIO_VERIFY_SERVICE_SID = `VA${"c".repeat(32)}`;

const { env } = await import("@/config/env.js");
const { validatePhoneNumber } = await import("@/utils/phone.js");
const { authController } = await import("@/controllers/auth.controller.js");
const { ReviewAllowlistVerificationService } =
  await import("@/services/verification.service.js");
const { default: configPlugin } = await import("@/plugins/config.js");
const { default: verificationServicePlugin } =
  await import("@/plugins/verification-service.js");
const { isValidPhoneNumber } = await import("libphonenumber-js");

/** The number the review notes nominate: synthetic, unassigned, allowlisted. */
const REVIEW_PHONE = "+15550000099";

/** A synthetic number of the same shape that is *not* on the list. */
const UNLISTED_SYNTHETIC = "+15550000098";

function stubReply() {
  const sent: { status?: number; body?: unknown } = {};
  const reply = {
    status(code: number) {
      sent.status = code;
      return reply;
    },
    send(body: unknown) {
      sent.body = body;
      return reply;
    },
  };
  return { reply: reply as unknown as FastifyReply, sent };
}

function stubVerificationService() {
  return {
    sendCode: vi.fn(async () => {}),
    checkCode: vi.fn(async () => false),
  };
}

/**
 * Call the real controller with a stubbed reply and a real allowlist wrapper
 * around a stub, so a Twilio call would be visible rather than attempted.
 */
async function requestCode(
  phoneNumber: string,
  inner: ReturnType<typeof stubVerificationService> = stubVerificationService(),
) {
  const { reply, sent } = stubReply();

  await authController.requestCode(
    {
      body: { phoneNumber, smsConsent: true },
      server: { verificationService: allowlist(inner) },
      log: { info: () => {}, warn: () => {}, error: () => {} },
    } as unknown as FastifyRequest<{ Body: RequestCodeInput }>,
    reply,
  );

  return sent;
}

function allowlist(inner: ReturnType<typeof stubVerificationService>) {
  return new ReviewAllowlistVerificationService(
    inner as unknown as IVerificationService,
    env.REVIEW_PHONES,
  );
}

describe("REVIEW_PHONES", () => {
  it("is normalised to E.164 at boot, so a formatted entry is not inert", () => {
    // "+1 (415) 555-2671" was configured. Both readers of this list compare it
    // by exact string, so it arrives as the E.164 form they compare against.
    expect(env.REVIEW_PHONES).toEqual([REVIEW_PHONE, "+14155552671"]);
  });

  it("accepts a listed number that libphonenumber calls invalid", () => {
    // The premise of the finding, measured with the dependency the API uses.
    expect(isValidPhoneNumber(REVIEW_PHONE)).toBe(false);

    expect(validatePhoneNumber(REVIEW_PHONE)).toEqual({
      isValid: true,
      e164: REVIEW_PHONE,
    });
  });

  it("matches a listed number typed with formatting", () => {
    // The reviewer types what the notes say, and the notes may show it
    // formatted; the returned E.164 is what the allowlist Set holds.
    expect(validatePhoneNumber("+1 (555) 000 0099")).toEqual({
      isValid: true,
      e164: REVIEW_PHONE,
    });
  });

  it("still refuses an unlisted synthetic number", () => {
    // The allowlist widens the gate for named numbers only.
    expect(validatePhoneNumber(UNLISTED_SYNTHETIC)).toEqual({
      isValid: false,
      error: "Invalid phone number format",
    });
  });

  it("still accepts an unlisted number that is real", () => {
    expect(validatePhoneNumber("+442071838750")).toEqual({
      isValid: true,
      e164: "+442071838750",
    });
  });
});

describe("POST /auth/request-code with the allowlist active", () => {
  it("answers 200 for a listed number and calls no verification service", async () => {
    const inner = stubVerificationService();
    const sent = await requestCode(REVIEW_PHONE, inner);

    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({
      success: true,
      message: "Verification code sent",
    });
    // Not "the code was sent" — nothing was sent. The wrapper is what answers,
    // and the wrapped service is never reached for an allowlisted number.
    expect(inner.sendCode).not.toHaveBeenCalled();
  });

  it("answers 200 when the listed number arrives formatted", async () => {
    const inner = stubVerificationService();
    const sent = await requestCode("+1 555 000 0099", inner);

    expect(sent.status).toBe(200);
    expect(inner.sendCode).not.toHaveBeenCalled();
  });

  it("leaves an unlisted number on the ordinary path", async () => {
    const inner = stubVerificationService();
    const sent = await requestCode("+442071838750", inner);

    expect(sent.status).toBe(200);
    expect(inner.sendCode).toHaveBeenCalledTimes(1);
  });

  it("answers 400 for a synthetic number that is not on the list", async () => {
    // This is the answer the review number used to get: the allowlist branch is
    // what stands between these two cases, so removing it turns the 200 above
    // back into this 400.
    const inner = stubVerificationService();
    const sent = await requestCode(UNLISTED_SYNTHETIC, inner);

    expect(sent.status).toBe(400);
    expect(sent.body).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid phone number format",
      },
    });
    expect(inner.sendCode).not.toHaveBeenCalled();
  });

  it("hands the E.164 it validated to the fixed-code check", async () => {
    // The other half of the sign-in: `verify-code` checks the code against the
    // same string the validator produced, through the same allowlist Set.
    const validation = validatePhoneNumber("+1 (555) 000 0099");

    expect(
      await allowlist(stubVerificationService()).checkCode(
        validation.e164 as string,
        "123456",
      ),
    ).toBe(true);
  });

  it("is not the route schema's job to reject the review number", () => {
    // The route's schema is `min(10)`/`max(20)` characters, so it lets the
    // synthetic number through and the controller's validator is the gate.
    const parsed = requestCodeSchema.safeParse({
      phoneNumber: REVIEW_PHONE,
      smsConsent: true,
    });

    expect(parsed.success).toBe(true);
  });
});

describe("the service the controller actually reads", () => {
  it("is the allowlist wrapper, and it answers the fixed code", async () => {
    // The plugin is the wiring between `REVIEW_PHONES` and the decorated
    // service; this is the half of the sign-in the validator gate cannot show.
    // No database and no network: an allowlisted number is answered before the
    // wrapped Twilio service is reached.
    const app = Fastify();
    await app.register(configPlugin);
    await app.register(verificationServicePlugin);

    expect(app.verificationService).toBeInstanceOf(
      ReviewAllowlistVerificationService,
    );
    expect(
      await app.verificationService.checkCode(REVIEW_PHONE, "123456"),
    ).toBe(true);
    expect(
      await app.verificationService.checkCode(REVIEW_PHONE, "000000"),
    ).toBe(false);

    await app.close();
  });
});
