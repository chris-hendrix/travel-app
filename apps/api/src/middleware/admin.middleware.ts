import type { FastifyRequest, FastifyReply } from "fastify";
import { users } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";

/**
 * Middleware that checks if the authenticated user has admin role.
 * Must be used AFTER authenticate() middleware.
 * During impersonation, checks the real admin's role (adminId), not the impersonated user.
 *
 * Admin scope carries no `checkBanned` (admin.routes.ts), so this function is
 * the only thing standing between a token and `/admin/users` — every user's
 * name, phone and status. It therefore checks the account is live itself, and
 * it already had the row in hand to do it: no extra query.
 *
 * Returns 401 UNAUTHORIZED if the account was deleted — `deleteAccount`
 * anonymizes the row and never clears `role`, so without this an admin who
 * deletes their own account keeps the admin API.
 * Returns 403 ACCOUNT_SUSPENDED if the account is banned, the same envelope
 * `checkBanned` sends. That one predates account deletion: a banned admin has
 * always kept admin access, and the two guards now agree.
 * Returns 403 FORBIDDEN if user is not an admin.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.user.adminId ?? request.user.sub;

  const result = await request.server.db
    .select({
      role: users.role,
      status: users.status,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = result[0];

  // The non-admin answer comes first, so a non-admin who is also banned or
  // deleted still gets the envelope it always got. Only a real admin is
  // interesting enough to be refused for why they lost the right.
  if (!user || user.role !== "admin") {
    return reply.status(403).send({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Admin access required",
      },
    });
  }

  if (user.deletedAt) {
    return reply.status(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Account deleted",
      },
    });
  }

  if (user.status === "banned") {
    return reply.status(403).send({
      success: false,
      error: {
        code: "ACCOUNT_SUSPENDED",
        message: "Your account has been suspended",
      },
    });
  }
}

/**
 * Middleware that checks if the authenticated user's account is active.
 * Must be used AFTER authenticate() middleware.
 * Returns 403 ACCOUNT_SUSPENDED if user is banned.
 * Returns 401 UNAUTHORIZED if the account has been deleted: a token issued
 * before the deletion is still cryptographically valid, so this is where the
 * tombstone closes it. The check rides on the query checkBanned already makes.
 */
export async function checkBanned(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await request.server.db
    .select({ status: users.status, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, request.user.sub))
    .limit(1);

  const user = result[0];

  if (user?.deletedAt) {
    return reply.status(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Account deleted",
      },
    });
  }

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
