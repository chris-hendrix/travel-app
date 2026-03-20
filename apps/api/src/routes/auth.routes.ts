import type { FastifyInstance } from "fastify";
import { authController } from "@/controllers/auth.controller.js";
import {
  smsRateLimitConfig,
  verifyCodeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import { authenticate } from "@/middleware/auth.middleware.js";
import {
  requestCodeSchema,
  verifyCodeSchema,
  completeProfileSchema,
  requestCodeResponseSchema,
  verifyCodeResponseSchema,
  completeProfileResponseSchema,
  getMeResponseSchema,
  logoutResponseSchema,
} from "@journiful/shared/schemas";
import type {
  RequestCodeInput,
  VerifyCodeInput,
  CompleteProfileInput,
} from "@journiful/shared/schemas";

/**
 * Authentication Routes
 * Registers all authentication-related endpoints
 *
 * @param fastify - Fastify instance
 */
export async function authRoutes(fastify: FastifyInstance) {
  // Prevent caching of auth responses (tokens, user data)
  fastify.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate");
    reply.header("Pragma", "no-cache");
  });

  /**
   * POST /request-code
   * Request a verification code via SMS
   * Rate limited to 5 requests per phone number per hour
   */
  fastify.post<{ Body: RequestCodeInput }>(
    "/request-code",
    {
      schema: {
        body: requestCodeSchema,
        response: { 200: requestCodeResponseSchema },
      },
      preHandler: fastify.rateLimit(smsRateLimitConfig),
    },
    authController.requestCode,
  );

  /**
   * POST /verify-code
   * Verify a code and authenticate user
   * Rate limited to 10 attempts per phone number per 15 minutes
   */
  fastify.post<{ Body: VerifyCodeInput }>(
    "/verify-code",
    {
      schema: {
        body: verifyCodeSchema,
        response: { 200: verifyCodeResponseSchema },
      },
      preHandler: fastify.rateLimit(verifyCodeRateLimitConfig),
    },
    authController.verifyCode,
  );

  /**
   * POST /complete-profile
   * Complete user profile with display name and timezone
   * Requires authentication via JWT token
   */
  fastify.post<{ Body: CompleteProfileInput }>(
    "/complete-profile",
    {
      schema: {
        body: completeProfileSchema,
        response: { 200: completeProfileResponseSchema },
      },
      preHandler: authenticate,
    },
    authController.completeProfile,
  );

  /**
   * GET /me
   * Get current authenticated user's profile information
   * Requires authentication via JWT token
   */
  fastify.get(
    "/me",
    {
      schema: {
        response: { 200: getMeResponseSchema },
      },
      preHandler: authenticate,
    },
    authController.getMe,
  );

  /**
   * POST /logout
   * Logout user by clearing authentication cookie
   * Requires authentication via JWT token
   */
  fastify.post(
    "/logout",
    {
      schema: {
        response: { 200: logoutResponseSchema },
      },
      preHandler: authenticate,
    },
    authController.logout,
  );
}
