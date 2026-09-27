import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateAccommodationInput,
  UpdateAccommodationInput,
} from "@journiful/shared/schemas";
import { AccommodationNotFoundError, TripNotFoundError } from "../errors.js";
import { auditLog } from "@/utils/audit.js";
import { attachPlace, attachPlaces } from "@/services/place-attach.service.js";

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

      // Resolve the linked place (detail mode: a fresh pick populates inline)
      const withPlace = await attachPlace(accommodation, request.server.placeCache, "detail");

      // Return success response with 201 status
      return reply.status(201).send({
        success: true,
        accommodation: withPlace,
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

      // Resolve places in one batched query (list mode: bounded inline refresh)
      const withPlaces = await attachPlaces(accommodations, request.server.placeCache, "list");

      return reply.status(200).send({
        success: true,
        accommodations: withPlaces,
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
      const withPlace = await attachPlace(accommodation, request.server.placeCache, "detail");
      return reply.status(200).send({
        success: true,
        accommodation: withPlace,
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
      const withPlace = await attachPlace(accommodation, request.server.placeCache, "detail");
      return reply.status(200).send({
        success: true,
        accommodation: withPlace,
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
      const withPlace = await attachPlace(accommodation, request.server.placeCache, "detail");
      return reply.status(200).send({
        success: true,
        accommodation: withPlace,
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
