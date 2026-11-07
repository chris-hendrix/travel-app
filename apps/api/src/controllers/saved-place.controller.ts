import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import type {
  CreateSavedPlaceInput,
  UpdateSavedPlaceInput,
  PinSavedPlaceInput,
} from "@journiful/shared/schemas";
import type { PlaceSummary } from "@journiful/shared/types";
import { trips, type SavedPlace } from "@/db/schema/index.js";
import { TripNotFoundError } from "../errors.js";
import { attachPlace } from "@/services/place-attach.service.js";

/** A saved-place row with its resolved `place` summary attached. */
type AttachedSavedPlace = SavedPlace & { place: PlaceSummary | null };

/**
 * Maps a stored row to the shared entity shape.
 *
 * The durable provider pair lives in `placeProvider`/`placeId` and
 * `place` is its resolved view; the row's own `name`/`address` are the
 * display snapshot — there are no separate picked-place snapshot
 * columns. `isPinned` reads `pinnedAt`: a set timestamp means pinned,
 * null means not.
 */
function toSavedPlaceEntity(row: AttachedSavedPlace) {
  return {
    id: row.id,
    tripId: row.tripId,
    createdBy: row.createdBy,
    name: row.name,
    address: row.address,
    notes: row.notes,
    placeType: row.placeType,
    place: row.place,
    isPinned: row.pinnedAt != null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Saved Place Controller
 * Handles saved-place-related HTTP requests
 */
export const savedPlaceController = {
  /**
   * Create saved place endpoint
   * Saves a place (typed word or Google provider pair) to a trip
   *
   * @route POST /api/trips/:tripId/saved-places
   * @middleware authenticate, requireCompleteProfile
   * @param request - Fastify request with saved-place data in body
   * @param reply - Fastify reply object
   * @returns 201 with the created saved place
   */
  async createSavedPlace(
    request: FastifyRequest<{
      Params: { tripId: string };
      Body: CreateSavedPlaceInput;
    }>,
    reply: FastifyReply,
  ) {
    // Params and body are validated by Fastify route schema
    const { tripId } = request.params;
    const data = request.body;

    try {
      const { savedPlaceService } = request.server;

      // Get userId from authenticated user (populated by authenticate middleware)
      const userId = request.user.sub;

      // Create saved place via service (throws TripNotFoundError for an
      // unknown trip, PermissionDeniedError for a non-member, and
      // SavedPlaceDuplicateError for a repeated Google pair)
      const savedPlace = await savedPlaceService.createSavedPlace(
        userId,
        tripId,
        data,
      );

      // Resolve the linked place (detail mode: a fresh pick populates inline)
      const withPlace = await attachPlace(
        savedPlace,
        request.server.placeCache,
        "detail",
      );

      // Return success response with 201 status
      return reply.status(201).send({
        success: true,
        savedPlace: toSavedPlaceEntity(withPlace),
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      // Log error for debugging
      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to create saved place",
      );

      // Return generic error response
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create saved place",
        },
      });
    }
  },

  /**
   * List saved places endpoint
   * Returns saved places for a trip, pinned first then newest
   *
   * @route GET /api/trips/:tripId/saved-places
   * @middleware authenticate
   * @param request - Fastify request
   * @param reply - Fastify reply object
   * @returns Success response with saved places array
   */
  async listSavedPlaces(
    request: FastifyRequest<{
      Params: { tripId: string };
    }>,
    reply: FastifyReply,
  ) {
    try {
      const { savedPlaceService, permissionsService } = request.server;
      const { tripId } = request.params;
      const userId = request.user.sub;

      // Unknown trip is 404 before membership is read, so a trip that
      // never existed never answers 403.
      const [trip] = await request.server.db
        .select({ id: trips.id })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);
      if (!trip) {
        throw new TripNotFoundError();
      }

      // Any member (any status) may read. A non-member on an existing
      // trip gets the same 404 as a nonexistent trip — like the event and
      // accommodation reads — so the list does not reveal which trips
      // exist. (Writes keep the explicit 403.)
      const isMember = await permissionsService.isMember(userId, tripId);
      if (!isMember) {
        throw new TripNotFoundError();
      }

      // The service attaches the cached `place` summary per row (list mode)
      const savedPlaces = await savedPlaceService.getSavedPlacesByTrip(
        tripId,
        request.server.placeCache,
        "list",
      );

      return reply.status(200).send({
        success: true,
        savedPlaces: savedPlaces.map(toSavedPlaceEntity),
      });
    } catch (error) {
      // Re-throw typed errors for error handler
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }

      request.log.error(
        { err: error, userId: request.user.sub, tripId: request.params.tripId },
        "Failed to list saved places",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get saved places",
        },
      });
    }
  },

  /**
   * Update saved place endpoint
   * Updates an existing saved place's details
   * The author or an organizer may edit
   *
   * @route PUT /api/saved-places/:id
   * @middleware authenticate
   * @param request - Fastify request with saved-place data in body
   * @param reply - Fastify reply object
   * @returns Success response with updated saved place
   */
  async updateSavedPlace(
    request: FastifyRequest<{
      Params: { id: string };
      Body: UpdateSavedPlaceInput;
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params and body are validated by Fastify route schema
      const { id } = request.params;
      const data = request.body;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to update saved place (throws SavedPlaceNotFoundError
      // for a gone row, PermissionDeniedError for a non-author non-organizer)
      const savedPlace = await request.server.savedPlaceService.updateSavedPlace(
        userId,
        id,
        data,
      );

      // Return success response
      const withPlace = await attachPlace(
        savedPlace,
        request.server.placeCache,
        "detail",
      );
      return reply.status(200).send({
        success: true,
        savedPlace: toSavedPlaceEntity(withPlace),
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
          savedPlaceId: request.params.id,
        },
        "Failed to update saved place",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update saved place",
        },
      });
    }
  },

  /**
   * Delete saved place endpoint
   * Hard-deletes a saved place (the table carries no deletedAt)
   * The author or an organizer may delete
   *
   * @route DELETE /api/saved-places/:id
   * @middleware authenticate
   * @param request - Fastify request
   * @param reply - Fastify reply object
   * @returns Success response
   */
  async deleteSavedPlace(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params are validated by Fastify route schema
      const { id } = request.params;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to delete saved place
      await request.server.savedPlaceService.deleteSavedPlace(userId, id);

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
          savedPlaceId: request.params.id,
        },
        "Failed to delete saved place",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete saved place",
        },
      });
    }
  },

  /**
   * Pin saved place endpoint
   * Pins a saved place (organizer only)
   *
   * @route POST /api/saved-places/:id/pin
   * @middleware authenticate
   * @param request - Fastify request with { pinned: true } in body
   * @param reply - Fastify reply object
   * @returns Success response with updated saved place
   */
  async pinSavedPlace(
    request: FastifyRequest<{
      Params: { id: string };
      Body: PinSavedPlaceInput;
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params and body are validated by Fastify route schema
      const { id } = request.params;
      const { pinned } = request.body;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Call service to pin saved place (organizer only)
      const savedPlace =
        await request.server.savedPlaceService.setSavedPlacePinned(
          userId,
          id,
          pinned,
        );

      // Return success response
      const withPlace = await attachPlace(
        savedPlace,
        request.server.placeCache,
        "detail",
      );
      return reply.status(200).send({
        success: true,
        savedPlace: toSavedPlaceEntity(withPlace),
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
          savedPlaceId: request.params.id,
        },
        "Failed to pin saved place",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to pin saved place",
        },
      });
    }
  },

  /**
   * Unpin saved place endpoint
   * Unpins a saved place (organizer only)
   *
   * @route DELETE /api/saved-places/:id/pin
   * @middleware authenticate
   * @param request - Fastify request
   * @param reply - Fastify reply object
   * @returns Success response with updated saved place
   */
  async unpinSavedPlace(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // Params are validated by Fastify route schema
      const { id } = request.params;

      // Extract user ID from JWT
      const userId = request.user.sub;

      // Unpin is DELETE without a body: pinned is always false here
      const savedPlace =
        await request.server.savedPlaceService.setSavedPlacePinned(
          userId,
          id,
          false,
        );

      // Return success response
      const withPlace = await attachPlace(
        savedPlace,
        request.server.placeCache,
        "detail",
      );
      return reply.status(200).send({
        success: true,
        savedPlace: toSavedPlaceEntity(withPlace),
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
          savedPlaceId: request.params.id,
        },
        "Failed to unpin saved place",
      );

      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to unpin saved place",
        },
      });
    }
  },
};
