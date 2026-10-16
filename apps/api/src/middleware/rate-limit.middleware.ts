import type { RateLimitOptions } from "@fastify/rate-limit";
import type { FastifyRequest } from "fastify";

/**
 * Per-route rate limits.
 *
 * Routes register these as `config: { rateLimit: <config> }` rather than as a
 * `preHandler` hook. app.ts registers @fastify/rate-limit with `global: true`,
 * the production setting (server.ts passes no override), and under it the
 * global hook runs at `onRequest` and marks the request as already limited
 * before any `preHandler` can run — so a `fastify.rateLimit(...)` preHandler is
 * wired but never fires. The `config` form is handled by the plugin's own
 * `onRoute` hook, so it applies under both settings.
 *
 * That hook also decides *when* the limiter runs, and it defaults to
 * `onRequest` — before the body is parsed. The two body-keyed limiters below
 * therefore set `hook: "preHandler"`.
 */

/**
 * The keys that skip the rate limiters altogether.
 *
 * `@fastify/rate-limit` compares this list against each limiter's **key**,
 * not `request.ip`. So an entry only ever matches a limiter that keys on
 * the same kind of value, and the two kinds this app keys on are addresses
 * (the global net and the write limit) and phone numbers (the SMS request
 * limit and the verify-code limit).
 *
 * **Loopback**, and only when no proxy is trusted. The global limiter's
 * `keyGenerator` asks for `user.sub` first, but its hook runs at
 * `onRequest`, where `request.user` is still null — so the global key is
 * the client address and loopback traffic is exempted from it like
 * anything else keyed by an address. Local dev and E2E drive all traffic
 * from one interface, and Node resolves `localhost` to `::1`, so exempting
 * only `127.0.0.1` left parallel E2E workers 429ing each other.
 *
 * The exemption is dropped when a proxy is trusted, and that is not
 * tidiness. With `TRUST_PROXY` the caller's own `X-Forwarded-For` decides
 * `request.ip`, so a loopback entry here is a header any client can send to
 * skip every address-keyed limit. Behind the proxy the forwarding hop is
 * the real client and a loopback key never occurs anyway, so the production
 * list is empty by construction rather than by trust.
 *
 * **The suite's own phone numbers**, and only while
 * `ENABLE_FIXED_VERIFICATION_CODE` is on. That flag swaps in
 * `MockVerificationService`, so no message is sent, no cost is incurred,
 * and the code is the same for every number — which leaves the two
 * phone-keyed limiters protecting nothing and failing the E2E suite instead:
 * it signs in as the same handful of admin numbers repeatedly, so the
 * 5-per-hour budget is spent by the suite rather than by anything it tests.
 * The flag cannot be true in production (`config/env.ts` refuses the
 * process, and the verification plugin refuses again), so this list is
 * empty in every deployment that enforces anything, and the real limiters
 * keep their coverage in `tests/integration/rate-limit.middleware.test.ts`
 * and `tests/integration/auth.request-code.test.ts`, which use numbers no
 * exemption names.
 */
export function rateLimitAllowList(config: {
  TRUST_PROXY: boolean;
  ENABLE_FIXED_VERIFICATION_CODE: boolean;
  RATE_LIMIT_EXEMPT_PHONES: readonly string[];
}): string[] {
  return [
    ...(config.TRUST_PROXY ? [] : LOOPBACK),
    ...(config.ENABLE_FIXED_VERIFICATION_CODE
      ? config.RATE_LIMIT_EXEMPT_PHONES
      : []),
  ];
}

/** The addresses a locally-run client connects from. */
const LOOPBACK = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

/** Strip spaces, dashes, and parens from phone — keep leading + for E.164 */
function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, "");
}

/**
 * Rate limiting configuration for SMS verification code requests.
 *
 * Limits each phone number to 5 verification code requests per hour
 * to prevent abuse and reduce SMS costs. Uses IP address as fallback
 * when phone number is not provided in the request body.
 */
export const smsRateLimitConfig: RateLimitOptions = {
  max: 5,
  timeWindow: "1 hour",
  // The key is the phone in the body, and the body is not parsed yet at the
  // plugin's default `onRequest` hook: without this the key would silently
  // fall back to the IP, which is a different control and a shared one behind
  // carrier NAT.
  hook: "preHandler",
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
  hook: "preHandler", // body-keyed, see smsRateLimitConfig
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
 * 100 requests per minute, keyed on the authenticated user when one is known
 * and on the client IP otherwise.
 *
 * The user half of that key is not reached today: every route in this repo
 * registers its limiter ahead of `authenticate`, at a hook that runs before it,
 * so `request.user` is still null and the key is the client IP. A genuine
 * per-user ceiling means moving the limiter after `authenticate` — a behaviour
 * change, not a configuration one. The branch is kept because it is what the
 * limit is meant to be and it degrades to the IP.
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
 * 30 requests per minute, keyed like `defaultRateLimitConfig` above — client
 * IP in practice, because the limiter runs before `authenticate`.
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
