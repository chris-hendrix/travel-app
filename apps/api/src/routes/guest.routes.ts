import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { guestController } from "@/controllers/guest.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import { checkBanned } from "@/middleware/admin.middleware.js";
import {
  defaultRateLimitConfig,
  writeRateLimitConfig,
} from "@/middleware/rate-limit.middleware.js";
import {
  createGuestSchema,
  updateGuestSchema,
  guestListResponseSchema,
  guestResponseSchema,
  successResponseSchema,
} from "@journiful/shared/schemas";
import type {
  CreateGuestInput,
  UpdateGuestInput,
} from "@journiful/shared/schemas";

const tripIdParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

const guestIdParamsSchema = z.object({
  id: z.string().uuid({ message: "Invalid guest ID format" }),
});

export async function guestRoutes(fastify: FastifyInstance) {
  /**
   * GET /trips/:tripId/guests
   * List guests for a trip
   */
  fastify.get<{ Params: { tripId: string } }>(
    "/trips/:tripId/guests",
    {
      schema: {
        params: tripIdParamsSchema,
        response: { 200: guestListResponseSchema },
      },
      preHandler: [fastify.rateLimit(defaultRateLimitConfig), authenticate, checkBanned],
    },
    guestController.listGuests,
  );

  /**
   * Write routes scope
   */
  fastify.register(async (scope) => {
    scope.addHook("preHandler", scope.rateLimit(writeRateLimitConfig));
    scope.addHook("preHandler", authenticate);
    scope.addHook("preHandler", checkBanned);
    scope.addHook("preHandler", requireCompleteProfile);

    /**
     * POST /trips/:tripId/guests
     * Create a new guest for a trip
     */
    scope.post<{ Params: { tripId: string }; Body: CreateGuestInput }>(
      "/trips/:tripId/guests",
      {
        schema: {
          params: tripIdParamsSchema,
          body: createGuestSchema,
          response: { 201: guestResponseSchema },
        },
      },
      guestController.createGuest,
    );

    /**
     * PUT /guests/:id
     * Update guest name
     */
    scope.put<{ Params: { id: string }; Body: UpdateGuestInput }>(
      "/guests/:id",
      {
        schema: {
          params: guestIdParamsSchema,
          body: updateGuestSchema,
          response: { 200: guestResponseSchema },
        },
      },
      guestController.updateGuest,
    );

    /**
     * DELETE /guests/:id
     * Delete a guest (fails if guest has payments)
     */
    scope.delete<{ Params: { id: string } }>(
      "/guests/:id",
      {
        schema: {
          params: guestIdParamsSchema,
          response: { 200: successResponseSchema },
        },
      },
      guestController.deleteGuest,
    );
  });
}
