import type { FastifyRequest, FastifyReply } from "fastify";
import { users } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";

/**
 * Account-state guard: what the caller's own row says about whether they can
 * act at all. `requireAdmin` (admin.middleware.ts) is the sibling question —
 * what the row says about the caller's role — and it stays there.
 *
 * Both hooks here run after `authenticate`, which is what puts `request.user`
 * there to read.
 */

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

/**
 * Middleware that refuses a caller whose token is an impersonation token.
 *
 * Under impersonation `sub` is the impersonated user and `adminId` is the
 * admin holding the token, so every write the route performs is filed under
 * somebody who did not make it: a report the admin screen renders as that
 * user's, a block they never wrote but the server then honours until they
 * undo something they do not remember doing. `DELETE /api/users/me` refuses
 * the same token for the same reason (user.controller.ts); this is that
 * refusal as a hook, so the three moderation writes cannot drift from it.
 *
 * Reading is deliberately not covered. An admin looking at what the
 * impersonated user sees is the point of impersonating.
 *
 * Returns 403 FORBIDDEN, the envelope `deleteAccount` sends.
 */
export async function refuseImpersonation(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.user.impersonating) return;

  return reply.status(403).send({
    success: false,
    error: {
      code: "FORBIDDEN",
      message: "Stop impersonating to moderate a user",
    },
  });
}
