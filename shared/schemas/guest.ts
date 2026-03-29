// Guest validation schemas for the Journiful platform

import { z } from "zod";
import { stripControlChars } from "../utils/sanitize";

/**
 * Validates guest creation data
 * - name: 1-100 characters (required)
 */
export const createGuestSchema = z.object({
  name: z
    .string()
    .min(1, {
      error: "Guest name must be at least 1 character",
    })
    .max(100, {
      error: "Guest name must not exceed 100 characters",
    })
    .transform(stripControlChars),
});

/**
 * Validates guest update data (all fields optional)
 * - name: 1-100 characters
 */
export const updateGuestSchema = z.object({
  name: z
    .string()
    .min(1, {
      error: "Guest name must be at least 1 character",
    })
    .max(100, {
      error: "Guest name must not exceed 100 characters",
    })
    .transform(stripControlChars),
});

// --- Response schemas ---

/** Guest entity as returned by the API */
const guestEntitySchema = z.object({
  id: z.string(),
  tripId: z.string(),
  name: z.string(),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** GET /api/trips/:tripId/guests - Guest list */
export const guestListResponseSchema = z.object({
  success: z.literal(true),
  guests: z.array(guestEntitySchema),
});

/** GET/POST/PUT single guest */
export const guestResponseSchema = z.object({
  success: z.literal(true),
  guest: guestEntitySchema,
});

// Inferred TypeScript types from schemas
export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>;
