// Member travel validation schemas for the Journiful platform

import { z } from "zod";

const locationField = z.string().max(500).optional();

/**
 * Base member travel data schema
 * - Used as the foundation for both create and update schemas
 * - Direction-based columns: arrival records carry arrivalTime/arrivalLocation
 *   as pertinent fields; departure records carry departureTime/departureLocation.
 *   Flight-lookup autofill may also populate the counterpart side silently.
 */
const baseMemberTravelSchema = z.object({
  travelType: z.enum(["arrival", "departure"], {
    error: "Travel type must be one of: arrival, departure",
  }),
  departureLocation: locationField,
  departureTime: z.string().datetime().optional(),
  arrivalLocation: locationField,
  arrivalTime: z.string().datetime().optional(),
  details: z
    .string()
    .max(500, {
      error: "Details must not exceed 500 characters",
    })
    .optional(),
  flightNumber: z.string().max(10).optional(),
});

/**
 * Server-side invariant: a record must carry at least the pertinent time
 * for its travelType (arrival → arrivalTime, departure → departureTime).
 */
const pertinentTimeRefine = (data: {
  travelType: "arrival" | "departure";
  arrivalTime?: string | undefined;
  departureTime?: string | undefined;
}) => {
  if (data.travelType === "arrival") return data.arrivalTime !== undefined;
  return data.departureTime !== undefined;
};

const pertinentTimeMessage = {
  error: "A record must include its pertinent time for its travel type",
} as const;

/**
 * Validates member travel creation data
 * - travelType: one of "arrival", "departure" (required)
 * - arrivalTime/arrivalLocation: pertinent for arrivals (arrivalTime required)
 * - departureTime/departureLocation: pertinent for departures (departureTime required)
 * - details: max 500 characters (optional)
 * - flightNumber: max 10 characters (optional)
 * - memberId: UUID of target member for delegation (optional, organizer-only)
 */
export const createMemberTravelSchema = baseMemberTravelSchema
  .extend({
    memberId: z.string().uuid("Invalid member ID format").optional(),
  })
  .refine(pertinentTimeRefine, pertinentTimeMessage);

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
  departureLocation: z.string().nullable(),
  departureTime: z.date().nullable(),
  arrivalLocation: z.string().nullable(),
  arrivalTime: z.date().nullable(),
  details: z.string().nullable(),
  flightNumber: z.string().nullable(),
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
