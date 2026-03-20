import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateMemberTravelInput,
  UpdateMemberTravelInput,
} from "@journiful/shared/schemas";
import { MemberTravelNotFoundError, TripNotFoundError } from "../errors.js";

/**
 * Member Travel Controller
 * Handles member travel-related HTTP requests
 */
export const memberTravelController = {
  /**
   * Create member travel endpoint
   * Creates a new member travel for a trip
   *
   * @route POST /api/trips/:tripId/member-travel
   * @middleware authenticate, requireCompleteProfile
   * @param request - Fastify request with member travel data in body
   * @param reply - Fastify reply object
   * @returns Success response with created member travel
   */
  async createMemberTravel(
    request: FastifyRequest<{
      Params: { tripId: string };
      Body: CreateMemberTravelInput;
    }>,
    reply: FastifyReply,
  ) {
    // Params and body are validated by Fastify route schema
    const { tripId } = request.params;
    const data = request.body;

    try {
      const { memberTravelService } = request.server;

      // Get userId from authenticated user (populated by authenticate middleware)
      const userId = request.user.sub;

      // Create member travel via service
      const memberTravel = await memberTravelService.createMemberTravel(
        userId,
        tripId,
        data,
      );

      // Return success response with 201 status
      return reply.status(201).send({
        success: true,
        memberTravel,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error for debugging
      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to create member travel",
      );

      // Return generic error response
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create member travel",
        },
      });
    }
  },

  /**
   * List member travel endpoint
   * Returns member travel for a trip with optional filtering
   *
   * @route GET /api/trips/:tripId/member-travel
   * @middleware authenticate
   * @param request - Fastify request
   * @param reply - Fastify reply object
   * @returns Success response with member travel array
   */
  async listMemberTravel(
    request: FastifyRequest<{
      Params: { tripId: string };
      Querystring: { includeDeleted?: boolean };
    }>,
    reply: FastifyReply,
  ) {
    try {
      const { memberTravelService, permissionsService } = request.server;
      const { tripId } = request.params;
      const userId = request.user.sub;

      // Query params are validated and coerced by Fastify route schema
      const { includeDeleted = false } = request.query;

      // Check if user is a member of the trip
      const isMember = await permissionsService.isMember(userId, tripId);
      if (!isMember) {
        throw new TripNotFoundError();
      }

      // Get member travel for the trip
      const memberTravels = await memberTravelService.getMemberTravelByTrip(
        tripId,
        includeDeleted,
      );

      return reply.status(200).send({
        success: true,
        memberTravels,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to list member travel",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get member travel",
        },
      });
    }
  },

  /**
   * Get member travel by ID
   * Returns member travel details for authorized users
   *
   * @route GET /api/member-travel/:id
   * @middleware authenticate
   */
  async getMemberTravel(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { memberTravelService, permissionsService } = request.server;
      // Params are validated by Fastify route schema (UUID format)
      const { id } = request.params;
      const userId = request.user.sub;

      // Get member travel from service
      const memberTravel = await memberTravelService.getMemberTravel(id);

      // Handle null response (not found or soft-deleted)
      if (!memberTravel) {
        throw new MemberTravelNotFoundError();
      }

      // Check if user is a member of the trip
      const isMember = await permissionsService.isMember(
        userId,
        memberTravel.tripId,
      );
      if (!isMember) {
        throw new MemberTravelNotFoundError();
      }

      // Return success response
      return reply.status(200).send({
        success: true,
        memberTravel,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        {
          error,
          userId: request.user.sub,
          memberTravelId: request.params.id,
        },
        "Failed to get member travel",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get member travel",
        },
      });
    }
  },

  /**
   * Update member travel endpoint
   * Updates an existing member travel's details
   * Only organizers can update member travel
   *
   * @route PUT /api/member-travel/:id
   * @middleware authenticate, requireCompleteProfile
   */
  async updateMemberTravel(
    request: FastifyRequest<{
      Params: { id: string };
      Body: UpdateMemberTravelInput;
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params and body are validated by Fastify route schema
      const { id } = request.params;
      const data = request.body;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to update member travel
      const memberTravel =
        await request.server.memberTravelService.updateMemberTravel(
          userId,
          id,
          data,
        );

      // Return success response
      return reply.status(200).send({
        success: true,
        memberTravel,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error and return 500
      request.log.error(
        {
          error,
          userId: request.user.sub,
          memberTravelId: request.params.id,
        },
        "Failed to update member travel",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update member travel",
        },
      });
    }
  },

  /**
   * Delete member travel endpoint
   * Soft-deletes a member travel if user is an organizer
   *
   * @route DELETE /api/member-travel/:id
   * @middleware authenticate, requireCompleteProfile
   */
  async deleteMemberTravel(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params are validated by Fastify route schema
      const { id } = request.params;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to delete member travel (soft delete)
      await request.server.memberTravelService.deleteMemberTravel(userId, id);

      // Return success response
      return reply.status(200).send({
        success: true,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error and return 500
      request.log.error(
        {
          error,
          userId: request.user.sub,
          memberTravelId: request.params.id,
        },
        "Failed to delete member travel",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete member travel",
        },
      });
    }
  },

  /**
   * Restore member travel endpoint
   * Restores a soft-deleted member travel
   * Only organizers can restore member travel
   *
   * @route POST /api/member-travel/:id/restore
   * @middleware authenticate, requireCompleteProfile
   */
  async restoreMemberTravel(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params are validated by Fastify route schema
      const { id } = request.params;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to restore member travel
      const memberTravel =
        await request.server.memberTravelService.restoreMemberTravel(
          userId,
          id,
        );

      // Return success response
      return reply.status(200).send({
        success: true,
        memberTravel,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error and return 500
      request.log.error(
        {
          error,
          userId: request.user.sub,
          memberTravelId: request.params.id,
        },
        "Failed to restore member travel",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to restore member travel",
        },
      });
    }
  },
};
