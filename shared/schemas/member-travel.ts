// Member travel validation schemas for the Journiful platform

import { z } from "zod";
import { TRANSPORT_MODES } from "../utils/travel";

/**
 * A location, or an explicit null to clear it. Nullable rather than
 * merely optional because clearing a filed value is a real answer: a
 * member who no longer wants "BCN T2" on their arrival needs a way to
 * say so, and until now the only way to unset one was to delete the
 * whole direction.
 *
 * Trimmed at the boundary, like the other three clearable fields, so a
 * where that is only whitespace is the empty where the member meant
 * rather than a distinct value the suggestion list would offer back. The
 * trim runs before the length check, so trailing space is not what pushes
 * a long location over the limit.
 */
const locationField = z.string().trim().max(500).nullable().optional();

/**
 * The mode the leg is taken by — one of the six
 * (`TRANSPORT_MODES`, `shared/utils/travel.ts`), and non-nullable: the
 * column is `NOT NULL DEFAULT 'flight'`, so there is no "unknown" for a
 * reader to carry, and an absent mode is a statement the client did not
 * make rather than one it made as null.
 *
 * The message is built from the array rather than written out, so a
 * seventh mode cannot leave the refusal naming six.
 */
const transportModeField = z.enum(TRANSPORT_MODES, {
  error: `Transport mode must be one of: ${TRANSPORT_MODES.join(", ")}`,
});

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
  // Optional here and non-nullable everywhere: the column's own default
  // is the only default, so a body that carries no mode says nothing
  // about the mode rather than resetting it — which is what lets the
  // service join it to the create `values` only when it is present.
  transportMode: transportModeField.optional(),
  departureLocation: locationField,
  departureTime: z.string().datetime().optional(),
  arrivalLocation: locationField,
  arrivalTime: z.string().datetime().optional(),
  details: z
    .string()
    .trim()
    .max(500, {
      error: "Details must not exceed 500 characters",
    })
    .nullable()
    .optional(),
  flightNumber: z.string().trim().max(10).nullable().optional(),
});

/**
 * Server-side invariant: a record must carry at least the pertinent time
 * for its travelType (arrival → arrivalTime, departure → departureTime).
 *
 * The two time columns stay non-nullable, and that is what keeps this
 * refine true as written: a direction is removed with Delete, not by
 * blanking its time. Only the four fields that can be cleared — the two
 * locations, the details and the flight number — carry `.nullable()`.
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
 * - transportMode: one of the six (optional; the column defaults to "flight")
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
 * - Allows partial updates to any member travel field but `travelType`
 * - Same validation rules as createMemberTravelSchema when fields are provided
 * - The mode is editable, unlike the member and the direction: a leg
 *   that started as a flight and became a train is the same leg, so
 *   `transportMode` rides on both schemas and stays non-nullable.
 *
 * `travelType` is create-only for the same reason `memberId` is: the
 * member and direction pair is the row's identity, and a PUT that flipped
 * the direction would file a second live row for that member (turning an
 * arrival into a departure leaves the departure pair free). A direction is
 * changed by deleting the leg and filing the other one, which is the flow
 * the delete/restore pair already owns. zod strips the unknown key rather
 * than rejecting it, so an older client that still sends its direction
 * gets its other edits applied rather than a 400.
 */
export const updateMemberTravelSchema = baseMemberTravelSchema
  .omit({ travelType: true })
  .partial();

// --- Response schemas ---

/** Member travel entity as returned by the API */
const memberTravelEntitySchema = z.object({
  id: z.string(),
  tripId: z.string(),
  memberId: z.string(),
  travelType: z.enum(["arrival", "departure"]),
  // Declared here as well as on the request schemas, and that is not
  // duplication for its own sake: Fastify answers through this schema,
  // which strips every field it does not declare — an undeclared mode
  // would leave the route's 200 carrying a column the client never sees.
  transportMode: transportModeField,
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

/**
 * GET /api/member-travel/locations — the travel wheres the caller's own
 * records already hold, across trips. Strings only, on purpose: this
 * feeds the `Where` field's suggestion list (D6), which autocompletes
 * from strings we already have and never from a place lookup — no place
 * id, no coordinates, and therefore no maps attribution.
 */
export const myTravelLocationsResponseSchema = z.object({
  success: z.literal(true),
  locations: z.array(z.string()),
});

// Inferred TypeScript types from schemas
export type CreateMemberTravelInput = z.infer<typeof createMemberTravelSchema>;
export type UpdateMemberTravelInput = z.infer<typeof updateMemberTravelSchema>;
export type MyTravelLocationsResponse = z.infer<
  typeof myTravelLocationsResponseSchema
>;
