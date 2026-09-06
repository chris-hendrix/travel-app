import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { guestMemberController } from "@/controllers/guest-member.controller.js";
import {
  authenticate,
  requireCompleteProfile,
} from "@/middleware/auth.middleware.js";
import { checkBanned } from "@/middleware/admin.middleware.js";
import { writeRateLimitConfig } from "@/middleware/rate-limit.middleware.js";
import {
  createGuestSchema,
  updateGuestSchema,
} from "@journiful/shared/schemas";
import type {
  CreateGuestInput,
  UpdateGuestInput,
} from "@journiful/shared/schemas";

// Reusable param schemas
const tripIdParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
});

const guestMemberParamsSchema = z.object({
  tripId: z.string().uuid({ message: "Invalid trip ID format" }),
  memberId: z.string().uuid({ message: "Invalid member ID format" }),
});

/**
 * Guest member response shape — mirrors MemberWithProfile (organizer view):
 * userId null, guestPhone surfaced, no isGuest field.
 */
const guestMemberResponseSchema = z.object({
  id: z.string(),
  userId: z.null(),
  displayName: z.string(),
  profilePhotoUrl: z.string().nullable(),
  handles: z.record(z.string(), z.string()).nullable().optional(),
  guestPhone: z.string().optional(),
  status: z.enum(["going", "not_going", "maybe", "no_response"]),
  isOrganizer: z.boolean(),
  createdAt: z.string(),
});

const createGuestResponseSchema = z.object({
  success: z.literal(true),
  member: guestMemberResponseSchema,
});

const updateGuestResponseSchema = z.object({
  success: z.literal(true),
  member: guestMemberResponseSchema,
});

/**
 * Guest Member Routes
 * Registers organizer-only guest member CRUD endpoints
 *
 * All routes require authentication + complete profile; the service layer
 * enforces the organizer-only check.
 *
 * @param fastify - Fastify instance
 */
export async function guestMemberRoutes(fastify: FastifyInstance) {
  fastify.register(async (scope) => {
    scope.addHook("preHandler", scope.rateLimit(writeRateLimitConfig));
    scope.addHook("preHandler", authenticate);
    scope.addHook("preHandler", checkBanned);
    scope.addHook("preHandler", requireCompleteProfile);

    /**
     * POST /trips/:tripId/members/guests
     * Create a guest member for a trip (organizer only)
     */
    scope.post<{ Params: { tripId: string }; Body: CreateGuestInput }>(
      "/trips/:tripId/members/guests",
      {
        schema: {
          params: tripIdParamsSchema,
          body: createGuestSchema,
          response: { 201: createGuestResponseSchema },
        },
      },
      guestMemberController.createGuest,
    );

    /**
     * PATCH /trips/:tripId/members/guests/:memberId
     * Update a guest member (organizer only)
     */
    scope.patch<{
      Params: { tripId: string; memberId: string };
      Body: UpdateGuestInput;
    }>(
      "/trips/:tripId/members/guests/:memberId",
      {
        schema: {
          params: guestMemberParamsSchema,
          body: updateGuestSchema,
          response: { 200: updateGuestResponseSchema },
        },
      },
      guestMemberController.updateGuest,
    );

    /**
     * DELETE /trips/:tripId/members/guests/:memberId
     * Delete a guest member (organizer only)
     */
    scope.delete<{ Params: { tripId: string; memberId: string } }>(
      "/trips/:tripId/members/guests/:memberId",
      {
        schema: {
          params: guestMemberParamsSchema,
          response: { 204: z.null().optional() },
        },
      },
      guestMemberController.deleteGuest,
    );
  });
}
