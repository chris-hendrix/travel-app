import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateTripInput,
  UpdateTripInput,
  AddCoOrganizerInput,
  CursorPaginationInput,
  UpdateMemberRoleInput,
} from "@journiful/shared/schemas";
import { TripNotFoundError, PermissionDeniedError } from "../errors.js";
import { auditLog } from "@/utils/audit.js";

/**
 * Trip Controller
 * Handles trip-related HTTP requests
 */
export const tripController = {
  /**
   * Create trip endpoint
   * Creates a new trip with the authenticated user as creator
   * Optionally adds co-organizers to the trip
   *
   * @route POST /api/trips
   * @middleware authenticate, requireCompleteProfile
   * @param request - Fastify request with trip data in body
   * @param reply - Fastify reply object
   * @returns Success response with created trip
   */
  async createTrip(
    request: FastifyRequest<{ Body: CreateTripInput }>,
    reply: FastifyReply,
  ) {
    // Body is validated by Fastify route schema
    const data = request.body;

    try {
      const { tripService } = request.server;

      // Get userId from authenticated user (populated by authenticate middleware)
      const userId = request.user.sub;

      // Create trip via service
      const trip = await tripService.createTrip(userId, data);

      auditLog(request, "trip.create", {
        resourceType: "trip",
        resourceId: trip.id,
      });

      // Return success response with 201 status
      return reply.status(201).send({
        success: true,
        trip,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error for debugging
      request.log.error(
        { error, userId: request.user.sub },
        "Failed to create trip",
      );

      // Return generic error response
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create trip",
        },
      });
    }
  },

  /**
   * Get user trips endpoint
   * Returns trip summaries for the authenticated user's dashboard
   *
   * @route GET /api/trips
   * @middleware authenticate
   * @param request - Fastify request
   * @param reply - Fastify reply object
   * @returns Success response with user's trips
   */
  async getUserTrips(
    request: FastifyRequest<{ Querystring: CursorPaginationInput }>,
    reply: FastifyReply,
  ) {
    try {
      const { tripService } = request.server;
      const userId = request.user.sub;

      // Pagination params are validated and coerced by Fastify route schema
      const { cursor, limit } = request.query;

      const result = await tripService.getUserTrips(userId, cursor, limit);

      return reply.status(200).send({
        success: true,
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        { error, userId: request.user.sub },
        "Failed to get user trips",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get trips",
        },
      });
    }
  },

  /**
   * Get trip by ID
   * Returns trip details for members only
   */
  async getTripById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { tripService } = request.server;
      // Params are validated by Fastify route schema (UUID format)
      const { id } = request.params;
      const userId = request.user.sub;

      // Get trip from service
      const result = await tripService.getTripById(id, userId);

      // Handle null response (either not found or not authorized)
      if (!result) {
        throw new TripNotFoundError();
      }

      // Destructure membership info from trip data
      const { isPreview, userRsvpStatus, isOrganizer, ...trip } = result;

      // Return success response with membership info
      return reply.status(200).send({
        success: true,
        trip,
        isPreview,
        userRsvpStatus,
        isOrganizer,
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
          tripId: request.params.id,
        },
        "Failed to get trip",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get trip",
        },
      });
    }
  },

  /**
   * Update trip endpoint
   * Updates an existing trip's details
   * Only organizers can update trips
   *
   * @route PUT /api/trips/:id
   * @middleware authenticate, requireCompleteProfile
   */
  async updateTrip(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateTripInput }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params and body are validated by Fastify route schema
      const { id } = request.params;
      const data = request.body;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to update trip
      const trip = await request.server.tripService.updateTrip(
        id,
        userId,
        data,
      );

      auditLog(request, "trip.update", {
        resourceType: "trip",
        resourceId: id,
      });

      // Return success response
      return reply.status(200).send({
        success: true,
        trip,
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
          tripId: request.params.id,
        },
        "Failed to update trip",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update trip",
        },
      });
    }
  },

  /**
   * Cancel trip endpoint
   * Soft-deletes a trip (sets cancelled=true) if user is an organizer
   *
   * @route DELETE /api/trips/:id
   * @middleware authenticate, requireCompleteProfile
   */
  async cancelTrip(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params are validated by Fastify route schema
      const { id } = request.params;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to cancel trip (soft delete)
      await request.server.tripService.cancelTrip(id, userId);

      auditLog(request, "trip.cancel", {
        resourceType: "trip",
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
          tripId: request.params.id,
        },
        "Failed to cancel trip",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to cancel trip",
        },
      });
    }
  },

  /**
   * Add co-organizer endpoint
   * Adds a co-organizer to a trip by phone number
   *
   * @route POST /api/trips/:id/co-organizers
   * @middleware authenticate, requireCompleteProfile
   */
  async addCoOrganizer(
    request: FastifyRequest<{
      Params: { id: string };
      Body: AddCoOrganizerInput;
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params and body are validated by Fastify route schema
      const { id } = request.params;
      const { phoneNumber } = request.body;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to add co-organizer (wrap phone in array)
      await request.server.tripService.addCoOrganizers(id, userId, [
        phoneNumber,
      ]);

      auditLog(request, "trip.co_organizer_added", {
        resourceType: "trip",
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
          tripId: request.params.id,
        },
        "Failed to add co-organizer",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add co-organizer",
        },
      });
    }
  },

  /**
   * Remove co-organizer endpoint
   * Removes a co-organizer from a trip
   *
   * @route DELETE /api/trips/:id/co-organizers/:userId
   * @middleware authenticate, requireCompleteProfile
   */
  async removeCoOrganizer(
    request: FastifyRequest<{ Params: { id: string; userId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params are validated by Fastify route schema
      const { id, userId: coOrgUserId } = request.params;

      // Extract requesting user ID from JWT
      const userId = request.user.sub;

      // Call service to remove co-organizer
      await request.server.tripService.removeCoOrganizer(
        id,
        userId,
        coOrgUserId,
      );

      auditLog(request, "trip.co_organizer_removed", {
        resourceType: "trip",
        resourceId: id,
        metadata: { targetUserId: coOrgUserId },
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
          tripId: request.params.id,
          coOrgUserId: request.params.userId,
        },
        "Failed to remove co-organizer",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to remove co-organizer",
        },
      });
    }
  },

  /**
   * Upload cover image endpoint
   * Uploads a cover image for a trip
   *
   * @route POST /api/trips/:id/cover-image
   * @middleware authenticate, requireCompleteProfile
   */
  async uploadCoverImage(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params are validated by Fastify route schema
      const { id } = request.params;

      // Get file from request
      let data;
      try {
        data = await request.file();
      } catch (fileError) {
        // Handle multipart parsing errors
        if (fileError instanceof Error) {
          const errorMsg = fileError.message.toLowerCase();

          if (
            errorMsg.includes("file too large") ||
            errorMsg.includes("request body is too large") ||
            errorMsg.includes("exceeds the maximum") ||
            errorMsg.includes("limit")
          ) {
            return reply.status(400).send({
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "Image must be under 5MB. Please choose a smaller file",
              },
            });
          }
          if (
            errorMsg.includes("the request is not multipart") ||
            errorMsg.includes("missing content-type header")
          ) {
            return reply.status(400).send({
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "No file uploaded",
              },
            });
          }
        }
        throw fileError;
      }

      if (!data) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "No file uploaded",
          },
        });
      }

      // Extract user ID from JWT
      const userId = request.user.sub;
      const { tripService, uploadService, permissionsService } = request.server;

      // Fetch trip to check permissions and get old image URL
      const trip = await tripService.getTripById(id, userId);

      if (!trip) {
        throw new TripNotFoundError();
      }

      // Check if user can edit trip
      const canEdit = await permissionsService.canEditTrip(userId, id);

      if (!canEdit) {
        throw new PermissionDeniedError(
          "Permission denied: Only organizers can upload cover images",
        );
      }

      // Convert file stream to buffer
      let fileBuffer;
      try {
        fileBuffer = await data.toBuffer();
      } catch (bufferError) {
        if (bufferError instanceof Error) {
          const errorMsg = bufferError.message.toLowerCase();
          if (
            errorMsg.includes("file too large") ||
            errorMsg.includes("limit") ||
            errorMsg.includes("exceeded") ||
            errorMsg.includes("maximum")
          ) {
            return reply.status(400).send({
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message:
                  "Image must be under 5MB. Please choose a smaller file",
              },
            });
          }
        }
        throw bufferError;
      }

      // Delete old cover image if it exists
      if (trip.coverImageUrl) {
        await uploadService.deleteImage(trip.coverImageUrl);
      }

      // Upload new image
      const imageUrl = await uploadService.uploadImage(
        fileBuffer,
        data.filename,
        data.mimetype,
      );

      // Update trip with new cover image URL
      const updatedTrip = await tripService.updateTrip(id, userId, {
        coverImageUrl: imageUrl,
      });

      // Return success response
      return reply.status(200).send({
        success: true,
        trip: updatedTrip,
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
          tripId: request.params.id,
        },
        "Failed to upload cover image",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload cover image",
        },
      });
    }
  },

  /**
   * Delete cover image endpoint
   * Removes the cover image from a trip
   *
   * @route DELETE /api/trips/:id/cover-image
   * @middleware authenticate, requireCompleteProfile
   */
  async deleteCoverImage(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params are validated by Fastify route schema
      const { id } = request.params;

      // Extract user ID from JWT
      const userId = request.user.sub;
      const { tripService, uploadService, permissionsService } = request.server;

      // Fetch trip to check permissions and get image URL
      const trip = await tripService.getTripById(id, userId);

      if (!trip) {
        throw new TripNotFoundError();
      }

      // Check if user can edit trip
      const canEdit = await permissionsService.canEditTrip(userId, id);

      if (!canEdit) {
        throw new PermissionDeniedError(
          "Permission denied: Only organizers can delete cover images",
        );
      }

      // Delete image file if it exists
      if (trip.coverImageUrl) {
        await uploadService.deleteImage(trip.coverImageUrl);
      }

      // Update trip to remove cover image URL
      const updatedTrip = await tripService.updateTrip(id, userId, {
        coverImageUrl: null,
      });

      // Return success response
      return reply.status(200).send({
        success: true,
        trip: updatedTrip,
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
          tripId: request.params.id,
        },
        "Failed to delete cover image",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete cover image",
        },
      });
    }
  },

  /**
   * Update member role endpoint
   * Promotes or demotes a member's co-organizer status
   *
   * @route PATCH /api/trips/:tripId/members/:memberId
   * @middleware authenticate, requireCompleteProfile
   * @param request - Fastify request with tripId and memberId in params, isOrganizer in body
   * @param reply - Fastify reply object
   * @returns Success response with updated member data
   */
  async updateMemberRole(
    request: FastifyRequest<{
      Params: { tripId: string; memberId: string };
      Body: UpdateMemberRoleInput;
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { tripId, memberId } = request.params;
      const { isOrganizer } = request.body;
      const userId = request.user.sub;

      const member = await request.server.invitationService.updateMemberRole(
        userId,
        tripId,
        memberId,
        isOrganizer,
      );

      auditLog(request, "member.role_updated", {
        resourceType: "trip",
        resourceId: tripId,
        metadata: { memberId, isOrganizer },
      });

      return reply.status(200).send({
        success: true,
        member,
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
          tripId: request.params.tripId,
          memberId: request.params.memberId,
        },
        "Failed to update member role",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update member role",
        },
      });
    }
  },
};
