import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { savedPlaceController } from "@/controllers/saved-place.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import { checkBanned } from "@/middleware/account-state.middleware.js";
import {
  defaultRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import {
  createSavedPlaceSchema,
  updateSavedPlaceSchema,
  pinSavedPlaceSchema,
  savedPlaceListResponseSchema,
  savedPlaceResponseSchema,
  successResponseSchema,
} from "@journiful/shared/schemas";
import type {
  CreateSavedPlaceInput,
  UpdateSavedPlaceInput,
  PinSavedPlaceInput,
} from "@journiful/shared/schemas";

// Reusable param schemas
const tripIdParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

const savedPlaceIdParamsSchema = z.object({
  id: z.string().uuid({ message: "Invalid saved place ID format" }),
});

/**
 * Saved Place Routes
 * Registers all saved-place-related endpoints
 *
 * Read routes (GET) require authentication only. Write routes carry the
 * write rate limit and require a complete profile via the scope-level
 * `requireCompleteProfile` hook — the same rule every other write
 * surface (trips, events, accommodations, member-travel, messages,
 * invitations) applies to its writes.
 *
 * @param fastify - Fastify instance
 */
export async function savedPlaceRoutes(fastify: FastifyInstance) {
  /**
   * GET /trips/:tripId/saved-places
   * List saved places for a trip, pinned first then newest
   * Requires authentication only (not complete profile)
   */
  fastify.get<{
    Params: { tripId: string };
  }>(
    "/trips/:tripId/saved-places",
    {
      schema: {
        params: tripIdParamsSchema,
        response: { 200: savedPlaceListResponseSchema },
      },
      config: { rateLimit: defaultRateLimitConfig },
      preHandler: [authenticate, checkBanned],
    },
    savedPlaceController.listSavedPlaces,
  );

  /**
   * Write routes scope
   * All routes registered here share authenticate + checkBanned hooks,
   * and each carries `writeRateLimitConfig` as its own route config.
   * `requireCompleteProfile` applies scope-wide to every write route
   * (create, update, delete, pin, unpin), mirroring the event scope.
   */
  fastify.register(async (scope) => {
    scope.addHook("preHandler", authenticate);
    scope.addHook("preHandler", checkBanned);
    scope.addHook("preHandler", requireCompleteProfile);

    /**
     * POST /trips/:tripId/saved-places
     * Save a place to a trip (typed word or Google provider pair)
     * Any member may save; duplicate Google pairs answer 409
     * SAVED_PLACE_DUPLICATE.
     */
    scope.post<{ Params: { tripId: string }; Body: CreateSavedPlaceInput }>(
      "/trips/:tripId/saved-places",
      {
        config: { rateLimit: writeRateLimitConfig },
        schema: {
          params: tripIdParamsSchema,
          body: createSavedPlaceSchema,
          response: { 201: savedPlaceResponseSchema },
        },
      },
      savedPlaceController.createSavedPlace,
    );

    /**
     * PUT /saved-places/:id
     * Update saved place details
     * The author or an organizer may edit
     */
    scope.put<{ Params: { id: string }; Body: UpdateSavedPlaceInput }>(
      "/saved-places/:id",
      {
        config: { rateLimit: writeRateLimitConfig },
        schema: {
          params: savedPlaceIdParamsSchema,
          body: updateSavedPlaceSchema,
          response: { 200: savedPlaceResponseSchema },
        },
      },
      savedPlaceController.updateSavedPlace,
    );

    /**
     * DELETE /saved-places/:id
     * Hard delete a saved place
     * The author or an organizer may delete
     */
    scope.delete<{ Params: { id: string } }>(
      "/saved-places/:id",
      {
        config: { rateLimit: writeRateLimitConfig },
        schema: {
          params: savedPlaceIdParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      savedPlaceController.deleteSavedPlace,
    );

    /**
     * POST /saved-places/:id/pin
     * Pin a saved place (organizer only); body carries { pinned: true }
     */
    scope.post<{ Params: { id: string }; Body: PinSavedPlaceInput }>(
      "/saved-places/:id/pin",
      {
        config: { rateLimit: writeRateLimitConfig },
        schema: {
          params: savedPlaceIdParamsSchema,
          body: pinSavedPlaceSchema,
          response: { 200: savedPlaceResponseSchema },
        },
      },
      savedPlaceController.pinSavedPlace,
    );

    /**
     * DELETE /saved-places/:id/pin
     * Unpin a saved place (organizer only); no body
     */
    scope.delete<{ Params: { id: string } }>(
      "/saved-places/:id/pin",
      {
        config: { rateLimit: writeRateLimitConfig },
        schema: {
          params: savedPlaceIdParamsSchema,
          response: { 200: savedPlaceResponseSchema },
        },
      },
      savedPlaceController.unpinSavedPlace,
    );
  });
}
