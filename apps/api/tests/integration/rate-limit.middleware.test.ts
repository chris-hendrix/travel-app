import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import {
  smsRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import { errorHandler } from "@/middleware/error.middleware.js";
import { generateUniquePhone } from "../test-utils.js";

/**
 * Build a minimal Fastify app for testing rate limiting.
 *
 * The plugin options mirror app.ts's, `global: true` included: that is the
 * setting production runs (server.ts passes no `rateLimit` override) and the
 * one under which a limiter registered as a route `preHandler` never fires —
 * the global hook is added at `onRequest` and marks the request as limited
 * before any preHandler can run, so the later limiter returns early. Every
 * limit in this repo is therefore registered as route `config.rateLimit`,
 * which is how the routes below register theirs.
 */
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    allowList: ["127.0.0.1", "::1", "::ffff:127.0.0.1"],
  });

  app.setErrorHandler(errorHandler);

  // Keyed on the phone in the body, which is what smsRateLimitConfig's
  // `hook: "preHandler"` is for: the body is not parsed at `onRequest`.
  app.post(
    "/test-sms-rate-limit",
    {
      config: { rateLimit: smsRateLimitConfig },
    },
    async (_request) => {
      return {
        success: true,
        message: "Request processed",
      };
    },
  );

  // Keyed on the caller's address, so requests have to come from somewhere the
  // allowList above does not exempt.
  app.post(
    "/test-write-rate-limit",
    {
      config: { rateLimit: writeRateLimitConfig },
    },
    async (_request) => {
      return {
        success: true,
        message: "Request processed",
      };
    },
  );

  await app.ready();

  return app;
}

/** A real client address: loopback is on the allowList above. */
const CLIENT = { remoteAddress: "203.0.113.7" };

describe("Rate Limit Middleware", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("smsRateLimitConfig", () => {
    it("should allow 5 requests per phone number within the time window", async () => {
      app = await buildTestApp();

      const phoneNumber = generateUniquePhone();

      // Make 5 requests - all should succeed
      for (let i = 0; i < 5; i++) {
        const response = await app.inject({
          method: "POST",
          url: "/test-sms-rate-limit",
          payload: {
            phoneNumber,
          },
        });

        expect(response.statusCode).toBe(200);

        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.message).toBe("Request processed");
      }
    });

    it("should reject the 6th request with 429 status and RATE_LIMIT_EXCEEDED error", async () => {
      app = await buildTestApp();

      const phoneNumber = generateUniquePhone();

      // Make 5 requests - all should succeed
      for (let i = 0; i < 5; i++) {
        const response = await app.inject({
          method: "POST",
          url: "/test-sms-rate-limit",
          payload: {
            phoneNumber,
          },
        });

        expect(response.statusCode).toBe(200);
      }

      // 6th request should be rate limited
      const response = await app.inject({
        method: "POST",
        url: "/test-sms-rate-limit",
        payload: {
          phoneNumber,
        },
      });

      expect(response.statusCode).toBe(429);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message:
            "Too many verification code requests. Please try again later.",
        },
      });
    });

    it("should use IP address as fallback when phoneNumber is not provided", async () => {
      app = await buildTestApp();

      // Make 5 requests without phoneNumber - should use IP as key
      for (let i = 0; i < 5; i++) {
        const response = await app.inject({
          method: "POST",
          url: "/test-sms-rate-limit",
          payload: {
            // No phoneNumber provided
          },
          ...CLIENT,
        });

        expect(response.statusCode).toBe(200);
      }

      // 6th request should be rate limited based on IP
      const response = await app.inject({
        method: "POST",
        url: "/test-sms-rate-limit",
        payload: {
          // No phoneNumber provided
        },
        ...CLIENT,
      });

      expect(response.statusCode).toBe(429);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message:
            "Too many verification code requests. Please try again later.",
        },
      });
    });

    it("should track different phone numbers independently", async () => {
      app = await buildTestApp();

      const phoneNumber1 = generateUniquePhone();
      const phoneNumber2 = generateUniquePhone();

      // Make 5 requests for first phone number
      for (let i = 0; i < 5; i++) {
        const response = await app.inject({
          method: "POST",
          url: "/test-sms-rate-limit",
          payload: {
            phoneNumber: phoneNumber1,
          },
        });

        expect(response.statusCode).toBe(200);
      }

      // 6th request for first phone number should be rate limited
      const response1 = await app.inject({
        method: "POST",
        url: "/test-sms-rate-limit",
        payload: {
          phoneNumber: phoneNumber1,
        },
      });

      expect(response1.statusCode).toBe(429);

      // First request for second phone number should succeed (independent limit)
      const response2 = await app.inject({
        method: "POST",
        url: "/test-sms-rate-limit",
        payload: {
          phoneNumber: phoneNumber2,
        },
      });

      expect(response2.statusCode).toBe(200);

      const body2 = JSON.parse(response2.body);
      expect(body2.success).toBe(true);
      expect(body2.message).toBe("Request processed");
    });

    it("should return correct error response format", async () => {
      app = await buildTestApp();

      const phoneNumber = generateUniquePhone();

      // Make 5 requests to reach the limit
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: "POST",
          url: "/test-sms-rate-limit",
          payload: {
            phoneNumber,
          },
        });
      }

      // 6th request should return properly formatted error
      const response = await app.inject({
        method: "POST",
        url: "/test-sms-rate-limit",
        payload: {
          phoneNumber,
        },
      });

      expect(response.statusCode).toBe(429);

      const body = JSON.parse(response.body);

      // Verify exact structure
      expect(body).toHaveProperty("success", false);
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "RATE_LIMIT_EXCEEDED");
      expect(body.error).toHaveProperty(
        "message",
        "Too many verification code requests. Please try again later.",
      );

      // Ensure no extra properties (requestId added by error middleware)
      expect(Object.keys(body)).toEqual(["success", "error", "requestId"]);
      expect(Object.keys(body.error)).toEqual(["code", "message"]);
    });
  });

  describe("route config limiters under the production configuration", () => {
    // The global limiter spends the request's single rate-limit slot at
    // `onRequest`, so under `global: true` a route's own limit only applies if
    // it is registered as route `config.rateLimit`. Nothing else in the suite
    // observes that shape directly: the app-level tests share the Postgres
    // store and only see the phone-keyed limits, because every IP-keyed key is
    // the loopback address app.ts allowLists.
    it("should enforce a route's own limit with the plugin running global: true", async () => {
      app = await buildTestApp();

      for (let i = 0; i < writeRateLimitConfig.max; i++) {
        const response = await app.inject({
          method: "POST",
          url: "/test-write-rate-limit",
          ...CLIENT,
        });

        expect(response.statusCode).toBe(200);
      }

      const response = await app.inject({
        method: "POST",
        url: "/test-write-rate-limit",
        ...CLIENT,
      });

      expect(response.statusCode).toBe(429);
      expect(JSON.parse(response.body)).toMatchObject({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many write requests. Please slow down.",
        },
      });
    });

    it("should still exempt loopback from an IP-keyed limit", async () => {
      // app.ts allowLists loopback so local dev and parallel E2E workers do not
      // 429 each other. It is also why an uninjected request (`app.inject()`
      // arrives from 127.0.0.1) cannot see any IP-keyed limit at all — the
      // tests above inject from a routable address for that reason.
      app = await buildTestApp();

      for (let i = 0; i < writeRateLimitConfig.max + 1; i++) {
        const response = await app.inject({
          method: "POST",
          url: "/test-write-rate-limit",
        });

        expect(response.statusCode).toBe(200);
      }
    });
  });
});
