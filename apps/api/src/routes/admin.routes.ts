import type { FastifyInstance } from "fastify";
import { adminController } from "@/controllers/admin.controller.js";
import { authenticate } from "@/middleware/auth.middleware.js";
import { requireAdmin } from "@/middleware/admin.middleware.js";
import {
  defaultRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import {
  adminListUsersQuerySchema,
  adminUserIdParamsSchema,
  adminUpdateUserSchema,
  adminUserListResponseSchema,
  adminUserDetailResponseSchema,
  adminUpdateUserResponseSchema,
  adminSuccessResponseSchema,
  adminImpersonateUserIdParamsSchema,
  adminImpersonateSchema,
  adminImpersonateResponseSchema,
} from "@journiful/shared/schemas";
import type {
  AdminListUsersQuery,
  AdminUpdateUserInput,
  AdminImpersonateInput,
} from "@journiful/shared/schemas";

/**
 * Admin Routes
 * Registers all admin-related endpoints
 * All routes require authentication and admin role
 *
 * @param fastify - Fastify instance
 */
export async function adminRoutes(fastify: FastifyInstance) {
  // All admin routes require authentication and admin role
  fastify.register(async (scope) => {
    scope.addHook("preHandler", authenticate);
    scope.addHook("preHandler", requireAdmin);

    /**
     * GET /users
     * List users with optional search, status filter, and pagination
     */
    scope.get<{ Querystring: AdminListUsersQuery }>(
      "/users",
      {
        schema: {
          querystring: adminListUsersQuerySchema,
          response: { 200: adminUserListResponseSchema },
        },
        preHandler: [scope.rateLimit(defaultRateLimitConfig)],
      },
      adminController.listUsers,
    );

    /**
     * GET /users/:id
     * Get user detail including role, status, and trip count
     */
    scope.get<{ Params: { id: string } }>(
      "/users/:id",
      {
        schema: {
          params: adminUserIdParamsSchema,
          response: { 200: adminUserDetailResponseSchema },
        },
        preHandler: [scope.rateLimit(defaultRateLimitConfig)],
      },
      adminController.getUserDetail,
    );

    /**
     * PUT /users/:id
     * Edit user profile (displayName, timezone)
     */
    scope.put<{ Params: { id: string }; Body: AdminUpdateUserInput }>(
      "/users/:id",
      {
        schema: {
          params: adminUserIdParamsSchema,
          body: adminUpdateUserSchema,
          response: { 200: adminUpdateUserResponseSchema },
        },
        preHandler: [scope.rateLimit(writeRateLimitConfig)],
      },
      adminController.updateUser,
    );

    /**
     * POST /users/:id/ban
     * Ban a user
     */
    scope.post<{ Params: { id: string } }>(
      "/users/:id/ban",
      {
        schema: {
          params: adminUserIdParamsSchema,
          response: { 200: adminSuccessResponseSchema },
        },
        preHandler: [scope.rateLimit(writeRateLimitConfig)],
      },
      adminController.banUser,
    );

    /**
     * POST /users/:id/unban
     * Unban a user
     */
    scope.post<{ Params: { id: string } }>(
      "/users/:id/unban",
      {
        schema: {
          params: adminUserIdParamsSchema,
          response: { 200: adminSuccessResponseSchema },
        },
        preHandler: [scope.rateLimit(writeRateLimitConfig)],
      },
      adminController.unbanUser,
    );

    /**
     * POST /users/:id/promote
     * Promote user to admin
     */
    scope.post<{ Params: { id: string } }>(
      "/users/:id/promote",
      {
        schema: {
          params: adminUserIdParamsSchema,
          response: { 200: adminSuccessResponseSchema },
        },
        preHandler: [scope.rateLimit(writeRateLimitConfig)],
      },
      adminController.promoteAdmin,
    );

    /**
     * POST /users/:id/demote
     * Demote admin to regular user
     */
    scope.post<{ Params: { id: string } }>(
      "/users/:id/demote",
      {
        schema: {
          params: adminUserIdParamsSchema,
          response: { 200: adminSuccessResponseSchema },
        },
        preHandler: [scope.rateLimit(writeRateLimitConfig)],
      },
      adminController.demoteAdmin,
    );

    /**
     * POST /impersonate/:userId
     * Start impersonation (requires re-auth code)
     */
    scope.post<{
      Params: { userId: string };
      Body: AdminImpersonateInput;
    }>(
      "/impersonate/:userId",
      {
        schema: {
          params: adminImpersonateUserIdParamsSchema,
          body: adminImpersonateSchema,
          response: { 200: adminImpersonateResponseSchema },
        },
        preHandler: [scope.rateLimit(writeRateLimitConfig)],
      },
      adminController.startImpersonation,
    );

    /**
     * POST /stop-impersonate
     * Stop impersonation and return to admin identity
     */
    scope.post(
      "/stop-impersonate",
      {
        schema: {
          response: { 200: adminImpersonateResponseSchema },
        },
        preHandler: [scope.rateLimit(writeRateLimitConfig)],
      },
      adminController.stopImpersonation,
    );

    /**
     * POST /revoke-impersonation/:userId
     * Emergency revoke all impersonation tokens for target user
     */
    scope.post<{ Params: { userId: string } }>(
      "/revoke-impersonation/:userId",
      {
        schema: {
          params: adminImpersonateUserIdParamsSchema,
          response: { 200: adminImpersonateResponseSchema },
        },
        preHandler: [scope.rateLimit(writeRateLimitConfig)],
      },
      adminController.revokeImpersonation,
    );
  });
}
