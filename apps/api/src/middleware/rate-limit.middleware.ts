import type { RateLimitOptions } from "@fastify/rate-limit";
import type { FastifyRequest } from "fastify";

/**
 * Rate limiting configuration for SMS verification code requests.
 *
 * Limits each phone number to 5 verification code requests per hour
 * to prevent abuse and reduce SMS costs. Uses IP address as fallback
 * when phone number is not provided in the request body.
 */
/** Strip spaces, dashes, and parens from phone — keep leading + for E.164 */
function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, "");
}

export const smsRateLimitConfig: RateLimitOptions = {
  max: 5,
  timeWindow: "1 hour",
  keyGenerator: (request: FastifyRequest) => {
    const { phoneNumber } = request.body as { phoneNumber?: string };
    return phoneNumber ? normalizePhone(phoneNumber) : request.ip;
  },
  errorResponseBuilder: (_request, context) => {
    const error = new Error(
      "Too many verification code requests. Please try again later.",
    ) as Error & {
      statusCode: number;
      code: string;
      customRateLimitMessage: string;
    };
    error.statusCode = context.statusCode;
    error.code = "RATE_LIMIT_EXCEEDED";
    // Add custom property to signal custom rate limit message
    error.customRateLimitMessage =
      "Too many verification code requests. Please try again later.";
    return error;
  },
};

/**
 * Rate limiting configuration for verification code verification attempts.
 *
 * Limits each phone number to 10 verification attempts per 15 minutes
 * to prevent brute-force attacks on verification codes.
 */
export const verifyCodeRateLimitConfig: RateLimitOptions = {
  max: 10,
  timeWindow: "15 minutes",
  keyGenerator: (request: FastifyRequest) => {
    const { phoneNumber } = request.body as { phoneNumber?: string };
    return phoneNumber ? normalizePhone(phoneNumber) : request.ip;
  },
  errorResponseBuilder: (_request, context) => {
    const error = new Error(
      `Too many verification attempts. Please wait ${Math.ceil((context.ttl || 0) / 1000)} seconds`,
    ) as Error & {
      statusCode: number;
      code: string;
      customRateLimitMessage: string;
    };
    error.statusCode = context.statusCode;
    error.code = "RATE_LIMIT_EXCEEDED";
    error.customRateLimitMessage = `Too many verification attempts. Please wait ${Math.ceil((context.ttl || 0) / 1000)} seconds`;
    return error;
  },
};

/**
 * Default rate limiting for authenticated read endpoints (GET).
 * 100 requests per minute per authenticated user (falls back to IP).
 */
export const defaultRateLimitConfig: RateLimitOptions = {
  max: 100,
  timeWindow: "1 minute",
  keyGenerator: (request: FastifyRequest) =>
    (request as FastifyRequest & { user?: { sub: string } }).user?.sub ||
    request.ip,
  errorResponseBuilder: (_request, context) => {
    const error = new Error("Too many requests. Please slow down.") as Error & {
      statusCode: number;
      code: string;
      customRateLimitMessage: string;
    };
    error.statusCode = context.statusCode;
    error.code = "RATE_LIMIT_EXCEEDED";
    error.customRateLimitMessage = "Too many requests. Please slow down.";
    return error;
  },
};

/**
 * Rate limiting for the Google Places photo proxy.
 * 60 requests per minute per IP — photos are public, cached, and
 * user identity is not available on this unauthenticated route.
 */
export const photoProxyRateLimitConfig: RateLimitOptions = {
  max: 60,
  timeWindow: "1 minute",
  keyGenerator: (request) => request.ip,
  errorResponseBuilder: (_request, context) => {
    const error = new Error("Too many requests. Please slow down.") as Error & {
      statusCode: number;
      code: string;
      customRateLimitMessage: string;
    };
    error.statusCode = context.statusCode;
    error.code = "RATE_LIMIT_EXCEEDED";
    error.customRateLimitMessage = "Too many requests. Please slow down.";
    return error;
  },
};

/**
 * Stricter rate limiting for write endpoints (POST/PUT/DELETE).
 * 30 requests per minute per authenticated user (falls back to IP).
 */
export const writeRateLimitConfig: RateLimitOptions = {
  max: 30,
  timeWindow: "1 minute",
  keyGenerator: (request: FastifyRequest) =>
    (request as FastifyRequest & { user?: { sub: string } }).user?.sub ||
    request.ip,
  errorResponseBuilder: (_request, context) => {
    const error = new Error(
      "Too many write requests. Please slow down.",
    ) as Error & {
      statusCode: number;
      code: string;
      customRateLimitMessage: string;
    };
    error.statusCode = context.statusCode;
    error.code = "RATE_LIMIT_EXCEEDED";
    error.customRateLimitMessage = "Too many write requests. Please slow down.";
    return error;
  },
};
