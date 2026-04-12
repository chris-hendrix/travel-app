import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  AdminListUsersQuery,
  AdminUpdateUserInput,
  AdminImpersonateInput,
} from "@journiful/shared/schemas";
import { users } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";

export const adminController = {
  async listUsers(
    request: FastifyRequest<{ Querystring: AdminListUsersQuery }>,
    reply: FastifyReply,
  ) {
    try {
      const { search, status, role, page, limit } = request.query;
      const result = await request.server.adminService.listUsers({
        search,
        status,
        role,
        page,
        limit,
      });

      return reply.status(200).send({
        success: true,
        users: result.users,
        total: result.total,
        page,
        limit,
      });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ error }, "Failed to list users");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list users",
        },
      });
    }
  },

  async getUserDetail(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const user = await request.server.adminService.getUserDetail(
        request.params.id,
      );

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "User not found",
          },
        });
      }

      return reply.status(200).send({
        success: true,
        user,
      });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ error }, "Failed to get user detail");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get user detail",
        },
      });
    }
  },

  async updateUser(
    request: FastifyRequest<{
      Params: { id: string };
      Body: AdminUpdateUserInput;
    }>,
    reply: FastifyReply,
  ) {
    try {
      const updated = await request.server.adminService.updateUser(
        request,
        request.params.id,
        request.body,
      );

      return reply.status(200).send({
        success: true,
        user: updated,
      });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ error }, "Failed to update user");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update user",
        },
      });
    }
  },

  async banUser(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      await request.server.adminService.banUser(request, request.params.id);
      return reply.status(200).send({ success: true });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ error }, "Failed to ban user");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to ban user",
        },
      });
    }
  },

  async unbanUser(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      await request.server.adminService.unbanUser(request, request.params.id);
      return reply.status(200).send({ success: true });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ error }, "Failed to unban user");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to unban user",
        },
      });
    }
  },

  async promoteAdmin(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      await request.server.adminService.promoteAdmin(
        request,
        request.params.id,
      );
      return reply.status(200).send({ success: true });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ error }, "Failed to promote user");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to promote user",
        },
      });
    }
  },

  async demoteAdmin(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      await request.server.adminService.demoteAdmin(
        request,
        request.params.id,
      );
      return reply.status(200).send({ success: true });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ error }, "Failed to demote user");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to demote user",
        },
      });
    }
  },

  async startImpersonation(
    request: FastifyRequest<{
      Params: { userId: string };
      Body: AdminImpersonateInput;
    }>,
    reply: FastifyReply,
  ) {
    try {
      const adminId = request.user.adminId ?? request.user.sub;
      const { code } = request.body;

      // Fetch admin's phone number for re-auth verification
      const adminResult = await request.server.db
        .select({ phoneNumber: users.phoneNumber })
        .from(users)
        .where(eq(users.id, adminId))
        .limit(1);

      const admin = adminResult[0];
      if (!admin) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Admin user not found" },
        });
      }

      // Verify re-auth code against admin's phone number
      const isValid = await request.server.verificationService.checkCode(
        admin.phoneNumber,
        code,
      );

      if (!isValid) {
        return reply.status(401).send({
          success: false,
          error: {
            code: "INVALID_CODE",
            message: "Invalid verification code",
          },
        });
      }

      // Start impersonation
      const token = await request.server.adminService.startImpersonation(
        request,
        request.params.userId,
      );

      // Set impersonation token as cookie
      reply.setCookie("auth_token", token, {
        httpOnly: true,
        secure:
          request.server.config.NODE_ENV === "production" ||
          request.server.config.COOKIE_SECURE,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60, // 1 hour
        ...(request.server.config.COOKIE_DOMAIN && {
          domain: request.server.config.COOKIE_DOMAIN,
        }),
      });

      return reply.status(200).send({
        success: true,
        message: "Impersonation started",
      });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ error }, "Failed to start impersonation");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to start impersonation",
        },
      });
    }
  },

  async stopImpersonation(request: FastifyRequest, reply: FastifyReply) {
    try {
      if (!request.user.impersonating) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "Not currently impersonating",
          },
        });
      }

      const token = await request.server.adminService.stopImpersonation(
        request,
      );

      // Set admin token as cookie with standard 7-day expiry
      reply.setCookie("auth_token", token, {
        httpOnly: true,
        secure:
          request.server.config.NODE_ENV === "production" ||
          request.server.config.COOKIE_SECURE,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60, // 7 days
        ...(request.server.config.COOKIE_DOMAIN && {
          domain: request.server.config.COOKIE_DOMAIN,
        }),
      });

      return reply.status(200).send({
        success: true,
        message: "Impersonation stopped",
      });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ error }, "Failed to stop impersonation");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to stop impersonation",
        },
      });
    }
  },

  async revokeImpersonation(
    request: FastifyRequest<{ Params: { userId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      await request.server.adminService.revokeImpersonation(
        request,
        request.params.userId,
      );

      return reply.status(200).send({
        success: true,
        message: "Impersonation revoked",
      });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      request.log.error({ error }, "Failed to revoke impersonation");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to revoke impersonation",
        },
      });
    }
  },
};
