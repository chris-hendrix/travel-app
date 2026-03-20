import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateAccommodationInput,
  UpdateAccommodationInput,
} from "@journiful/shared/schemas";
import { AccommodationNotFoundError, TripNotFoundError } from "../errors.js";
import { auditLog } from "@/utils/audit.js";

/**
 * Accommodation Controller
 * Handles accommodation-related HTTP requests
 */
export const accommodationController = {
  /**
   * Create accommodation endpoint
   * Creates a new accommodation for a trip
   *
   * @route POST /api/trips/:tripId/accommodations
   * @middleware authenticate, requireCompleteProfile
   * @param request - Fastify request with accommodation data in body
   * @param reply - Fastify reply object
   * @returns Success response with created accommodation
   */
  async createAccommodation(
    request: FastifyRequest<{
      Params: { tripId: string };
      Body: CreateAccommodationInput;
    }>,
    reply: FastifyReply,
  ) {
    // Params and body are validated by Fastify route schema
    const { tripId } = request.params;
    const data = request.body;

    try {
      const { accommodationService } = request.server;

      // Get userId from authenticated user (populated by authenticate middleware)
      const userId = request.user.sub;

      // Create accommodation via service
      const accommodation = await accommodationService.createAccommodation(
        userId,
        tripId,
        data,
      );

      // Return success response with 201 status
      return reply.status(201).send({
        success: true,
        accommodation,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error for debugging
      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to create accommodation",
      );

      // Return generic error response
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create accommodation",
        },
      });
    }
  },

  /**
   * List accommodations endpoint
   * Returns accommodations for a trip with optional filtering
   *
   * @route GET /api/trips/:tripId/accommodations
   * @middleware authenticate
   * @param request - Fastify request
   * @param reply - Fastify reply object
   * @returns Success response with accommodations array
   */
  async listAccommodations(
    request: FastifyRequest<{
      Params: { tripId: string };
      Querystring: { includeDeleted?: boolean };
    }>,
    reply: FastifyReply,
  ) {
    try {
      const { accommodationService, permissionsService } = request.server;
      const { tripId } = request.params;
      const userId = request.user.sub;

      // Query params are validated and coerced by Fastify route schema
      const { includeDeleted = false } = request.query;

      // Check if user is a member of the trip
      const isMember = await permissionsService.isMember(userId, tripId);
      if (!isMember) {
        throw new TripNotFoundError();
      }

      // Get accommodations for the trip
      const accommodations = await accommodationService.getAccommodationsByTrip(
        tripId,
        includeDeleted,
      );

      return reply.status(200).send({
        success: true,
        accommodations,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to list accommodations",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get accommodations",
        },
      });
    }
  },

  /**
   * Get accommodation by ID
   * Returns accommodation details for authorized users
   *
   * @route GET /api/accommodations/:id
   * @middleware authenticate
   */
  async getAccommodation(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { accommodationService, permissionsService } = request.server;
      // Params are validated by Fastify route schema (UUID format)
      const { id } = request.params;
      const userId = request.user.sub;

      // Get accommodation from service
      const accommodation = await accommodationService.getAccommodation(id);

      // Handle null response (not found or soft-deleted)
      if (!accommodation) {
        throw new AccommodationNotFoundError();
      }

      // Check if user is a member of the trip
      const isMember = await permissionsService.isMember(
        userId,
        accommodation.tripId,
      );
      if (!isMember) {
        throw new AccommodationNotFoundError();
      }

      // Return success response
      return reply.status(200).send({
        success: true,
        accommodation,
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
          accommodationId: request.params.id,
        },
        "Failed to get accommodation",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get accommodation",
        },
      });
    }
  },

  /**
   * Update accommodation endpoint
   * Updates an existing accommodation's details
   * Only organizers can update accommodations
   *
   * @route PUT /api/accommodations/:id
   * @middleware authenticate, requireCompleteProfile
   */
  async updateAccommodation(
    request: FastifyRequest<{
      Params: { id: string };
      Body: UpdateAccommodationInput;
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params and body are validated by Fastify route schema
      const { id } = request.params;
      const data = request.body;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to update accommodation
      const accommodation =
        await request.server.accommodationService.updateAccommodation(
          userId,
          id,
          data,
        );

      // Return success response
      return reply.status(200).send({
        success: true,
        accommodation,
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
          accommodationId: request.params.id,
        },
        "Failed to update accommodation",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update accommodation",
        },
      });
    }
  },

  /**
   * Delete accommodation endpoint
   * Soft-deletes an accommodation if user is an organizer
   *
   * @route DELETE /api/accommodations/:id
   * @middleware authenticate, requireCompleteProfile
   */
  async deleteAccommodation(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params are validated by Fastify route schema
      const { id } = request.params;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to delete accommodation (soft delete)
      await request.server.accommodationService.deleteAccommodation(userId, id);

      auditLog(request, "accommodation.delete", {
        resourceType: "accommodation",
        resourceId: id,
      });

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
          accommodationId: request.params.id,
        },
        "Failed to delete accommodation",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete accommodation",
        },
      });
    }
  },

  /**
   * Restore accommodation endpoint
   * Restores a soft-deleted accommodation
   * Only organizers can restore accommodations
   *
   * @route POST /api/accommodations/:id/restore
   * @middleware authenticate, requireCompleteProfile
   */
  async restoreAccommodation(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params are validated by Fastify route schema
      const { id } = request.params;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to restore accommodation
      const accommodation =
        await request.server.accommodationService.restoreAccommodation(
          userId,
          id,
        );

      // Return success response
      return reply.status(200).send({
        success: true,
        accommodation,
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
          accommodationId: request.params.id,
        },
        "Failed to restore accommodation",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to restore accommodation",
        },
      });
    }
  },
};
