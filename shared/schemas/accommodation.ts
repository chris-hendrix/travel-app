// Accommodation validation schemas for the Tripful platform

import { z } from "zod";
import { stripControlChars } from "../utils/sanitize";

/**
 * Base accommodation data schema (without cross-field validation)
 * - Used as the foundation for both create and update schemas
 */
const baseAccommodationSchema = z.object({
  name: z
    .string()
    .min(1, {
      error: "Accommodation name must be at least 1 character",
    })
    .max(255, {
      error: "Accommodation name must not exceed 255 characters",
    })
    .transform(stripControlChars),
  address: z.string().max(500).optional(),
  description: z
    .string()
    .max(2000, {
      error: "Description must not exceed 2000 characters",
    })
    .optional(),
  checkIn: z.string().datetime({ offset: true }).or(z.string().datetime()),
  checkOut: z.string().datetime({ offset: true }).or(z.string().datetime()),
  links: z
    .array(z.string().url("Link must be a valid URL"))
    .max(10, {
      error: "Links must not exceed 10 items",
    })
    .optional(),
});

/**
 * Validates accommodation creation data
 * - name: 1-255 characters (required)
 * - address: string (optional)
 * - description: max 2000 characters (optional)
 * - checkIn: ISO 8601 datetime string (required)
 * - checkOut: ISO 8601 datetime string (required), must be > checkIn
 * - links: array of URLs, max 10 items (optional)
 */
export const createAccommodationSchema = baseAccommodationSchema.refine(
  (data) => {
    // Cross-field validation: checkOut must be > checkIn
    return new Date(data.checkOut) > new Date(data.checkIn);
  },
  {
    message: "Check-out date must be after check-in date",
    path: ["checkOut"],
  },
);

/**
 * Validates accommodation update data (all fields optional)
 * - Allows partial updates to any accommodation field
 * - Same validation rules as createAccommodationSchema when fields are provided
 */
export const updateAccommodationSchema = baseAccommodationSchema
  .partial()
  .refine(
    (data) => {
      // Cross-field validation: checkOut must be > checkIn (when both provided)
      if (data.checkIn && data.checkOut) {
        return new Date(data.checkOut) > new Date(data.checkIn);
      }
      return true;
    },
    {
      message: "Check-out date must be after check-in date",
      path: ["checkOut"],
    },
  );

// --- Response schemas ---

/** Accommodation entity as returned by the API */
const accommodationEntitySchema = z.object({
  id: z.string(),
  tripId: z.string(),
  createdBy: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  description: z.string().nullable(),
  checkIn: z.date(),
  checkOut: z.date(),
  links: z.array(z.string()).nullable(),
  deletedAt: z.date().nullable(),
  deletedBy: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** GET /api/trips/:tripId/accommodations - Accommodation list */
export const accommodationListResponseSchema = z.object({
  success: z.literal(true),
  accommodations: z.array(accommodationEntitySchema),
});

/** GET/POST/PUT/restore single accommodation */
export const accommodationResponseSchema = z.object({
  success: z.literal(true),
  accommodation: accommodationEntitySchema,
});

// Inferred TypeScript types from schemas
export type CreateAccommodationInput = z.infer<
  typeof createAccommodationSchema
>;
export type UpdateAccommodationInput = z.infer<
  typeof updateAccommodationSchema
>;
