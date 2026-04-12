import type { FastifyRequest, FastifyReply } from "fastify";
import { users } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";

/**
 * Middleware that checks if the authenticated user has admin role.
 * Must be used AFTER authenticate() middleware.
 * During impersonation, checks the real admin's role (adminId), not the impersonated user.
 * Returns 403 FORBIDDEN if user is not an admin.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user.adminId ?? request.user.sub;

  const result = await request.server.db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = result[0];

  if (!user || user.role !== "admin") {
    return reply.status(403).send({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Admin access required",
      },
    });
  }
}

/**
 * Middleware that checks if the authenticated user's account is active.
 * Must be used AFTER authenticate() middleware.
 * Returns 403 ACCOUNT_SUSPENDED if user is banned.
 */
export async function checkBanned(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await request.server.db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, request.user.sub))
    .limit(1);

  const user = result[0];

  if (user && user.status === "banned") {
    return reply.status(403).send({
      success: false,
      error: {
        code: "ACCOUNT_SUSPENDED",
        message: "Your account has been suspended",
      },
    });
  }
}
