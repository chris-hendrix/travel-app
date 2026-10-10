import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import {
  MockVerificationService,
  ReviewAllowlistVerificationService,
  TwilioVerificationService,
  type IVerificationService,
} from "@/services/verification.service.js";

/**
 * Verification service plugin
 * Creates the appropriate IVerificationService implementation based on config:
 * - ENABLE_FIXED_VERIFICATION_CODE=true → MockVerificationService (dev/test)
 * - Otherwise → TwilioVerificationService (production)
 *
 * REVIEW_PHONES then wraps whichever implementation was chosen. That is the
 * App Review sign-in escape hatch: the numbers it names complete sign-in with
 * the fixed code and no Twilio call. It is a different mechanism from
 * ENABLE_FIXED_VERIFICATION_CODE — the flag applies the fixed code to everyone
 * and is blocked in production; the allowlist applies to named numbers only.
 */
export default fp(
  async function verificationServicePlugin(fastify: FastifyInstance) {
    // Defense in depth: never allow mock verification in production
    if (
      fastify.config.NODE_ENV === "production" &&
      fastify.config.ENABLE_FIXED_VERIFICATION_CODE
    ) {
      throw new Error(
        "FATAL: MockVerificationService cannot be used in production",
      );
    }

    // One implementation, chosen as before, then optionally wrapped by the
    // App Review allowlist. Decorated exactly once — this is an fp() plugin,
    // so a second decorate() of the same name throws FST_ERR_DEC_ALREADY_PRESENT.
    let impl: IVerificationService;

    if (fastify.config.ENABLE_FIXED_VERIFICATION_CODE) {
      impl = new MockVerificationService(fastify.log);
      fastify.log.warn("Using MockVerificationService (fixed code: 123456)");
    } else {
      const {
        TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN,
        TWILIO_VERIFY_SERVICE_SID,
      } = fastify.config;

      if (
        !TWILIO_ACCOUNT_SID ||
        !TWILIO_AUTH_TOKEN ||
        !TWILIO_VERIFY_SERVICE_SID
      ) {
        throw new Error(
          "Twilio env vars required when ENABLE_FIXED_VERIFICATION_CODE is false: " +
            "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID",
        );
      }

      impl = new TwilioVerificationService({
        accountSid: TWILIO_ACCOUNT_SID,
        authToken: TWILIO_AUTH_TOKEN,
        verifyServiceSid: TWILIO_VERIFY_SERVICE_SID,
        logger: fastify.log,
      });
      fastify.log.info("Using TwilioVerificationService");
    }

    const reviewPhones = fastify.config.REVIEW_PHONES;
    if (reviewPhones.length > 0) {
      impl = new ReviewAllowlistVerificationService(
        impl,
        reviewPhones,
        fastify.log,
      );
      fastify.log.warn(
        { reviewPhones },
        "App Review allowlist active: these numbers sign in with the fixed code and no Twilio call",
      );
    }

    fastify.decorate("verificationService", impl);
  },
  {
    name: "verification-service",
    fastify: "5.x",
    dependencies: ["config"],
  },
);
