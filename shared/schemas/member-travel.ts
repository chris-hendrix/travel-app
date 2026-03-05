// Member travel validation schemas for the Tripful platform

import { z } from "zod";

/**
 * Base member travel data schema
 * - Used as the foundation for both create and update schemas
 */
const baseMemberTravelSchema = z.object({
  travelType: z.enum(["arrival", "departure"], {
    error: "Travel type must be one of: arrival, departure",
  }),
  time: z.string().datetime(),
  location: z.string().max(500).optional(),
  details: z
    .string()
    .max(500, {
      error: "Details must not exceed 500 characters",
    })
    .optional(),
});

/**
 * Validates member travel creation data
 * - travelType: one of "arrival", "departure" (required)
 * - time: ISO 8601 datetime string (required)
 * - location: string (optional)
 * - details: max 500 characters (optional)
 * - memberId: UUID of target member for delegation (optional, organizer-only)
 */
export const createMemberTravelSchema = baseMemberTravelSchema.extend({
  memberId: z.uuid({ error: "Invalid member ID format" }).optional(),
});

/**
 * Validates member travel update data (all fields optional)
 * - Allows partial updates to any member travel field
 * - Same validation rules as createMemberTravelSchema when fields are provided
 */
export const updateMemberTravelSchema = baseMemberTravelSchema.partial();

// --- Response schemas ---

/** Member travel entity as returned by the API */
const memberTravelEntitySchema = z.object({
  id: z.string(),
  tripId: z.string(),
  memberId: z.string(),
  travelType: z.enum(["arrival", "departure"]),
  time: z.date(),
  location: z.string().nullable(),
  details: z.string().nullable(),
  deletedAt: z.date().nullable(),
  deletedBy: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  memberName: z.string().optional(),
});

/** GET /api/trips/:tripId/member-travel - Member travel list */
export const memberTravelListResponseSchema = z.object({
  success: z.literal(true),
  memberTravels: z.array(memberTravelEntitySchema),
});

/** GET/POST/PUT/restore single member travel */
export const memberTravelResponseSchema = z.object({
  success: z.literal(true),
  memberTravel: memberTravelEntitySchema,
});

// Inferred TypeScript types from schemas
export type CreateMemberTravelInput = z.infer<typeof createMemberTravelSchema>;
export type UpdateMemberTravelInput = z.infer<typeof updateMemberTravelSchema>;
