import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  AdminListUsersQuery,
  AdminUpdateUserInput,
} from "@journiful/shared/schemas";

export const adminController = {
  async listUsers(
    request: FastifyRequest<{ Querystring: AdminListUsersQuery }>,
    reply: FastifyReply,
  ) {
    try {
      const { search, status, page, limit } = request.query;
      const result = await request.server.adminService.listUsers({
        search,
        status,
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
};
