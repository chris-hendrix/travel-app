import type { FastifyRequest, FastifyReply } from "fastify";
import { users } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";

/**
 * Authentication middleware that verifies JWT token and populates request.user
 * Extracts token from auth_token cookie or Authorization header
 * Returns 401 UNAUTHORIZED if token is missing or invalid
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    // Verify JWT token and populate request.user with JWTPayload
    // After jwtVerify(), request.user contains { sub, name?, jti?, iat, exp }
    await request.jwtVerify();
  } catch {
    // JWT verification failed (missing token, invalid signature, expired, etc.)
    return reply.status(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired token",
      },
    });
  }

  // Check token blacklist (skip for tokens without jti for backward compat)
  if (request.user.jti) {
    const isRevoked = await request.server.authService.isBlacklisted(
      request.user.jti,
    );
    if (isRevoked) {
      return reply.status(401).send({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Token has been revoked" },
      });
    }
  }
}

/**
 * Middleware that checks if authenticated user has a complete profile
 * Must be used AFTER authenticate() middleware
 * Returns 403 PROFILE_INCOMPLETE if user's displayName is missing or empty
 */
export async function requireCompleteProfile(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Check if user is authenticated (authenticate middleware should run first)
  if (!request.user) {
    return reply.status(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  }

  // Fetch user from database to check profile completeness
  const result = await request.server.db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, request.user.sub))
    .limit(1);

  const user = result[0];

  // User not found in database (shouldn't happen if JWT is valid, but check anyway)
  if (!user) {
    return reply.status(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "User not found",
      },
    });
  }

  // Check if profile is complete (displayName must exist and not be empty)
  if (!user.displayName || user.displayName.trim() === "") {
    return reply.status(403).send({
      success: false,
      error: {
        code: "PROFILE_INCOMPLETE",
        message: "Profile setup required. Please complete your profile.",
      },
    });
  }

  // Profile is complete, allow request to proceed
}
