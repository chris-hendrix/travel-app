// Saved-place validation schemas for the Journiful platform

import { z } from "zod";
import { stripControlChars } from "../utils/sanitize";
import {
  placePairFields,
  isCompletePlacePair,
  placePairIncompleteMessage,
} from "./place";
import { placeSummarySchema } from "./place";

const placeTypeEnum = z.enum(
  ["travel", "food_and_drink", "arts_and_entertainment", "outdoors", "nightlife", "wellness", "shopping", "lodging", "misc"],
  {
    error:
      "Place type must be one of: travel, food_and_drink, arts_and_entertainment, outdoors, nightlife, wellness, shopping, lodging, misc",
  },
);

/**
 * Base saved-place data schema (without cross-field validation)
 * - Used as the foundation for both create and update schemas
 */
const baseSavedPlaceSchema = z
  .object({
    name: z
    .string()
    .min(1, {
      error: "Saved place name must be at least 1 character",
    })
    .max(255, {
      error: "Saved place name must not exceed 255 characters",
    })
    .transform(stripControlChars),
    address: z.string().max(500).optional(),
    description: z
      .string()
      .max(2000, {
        error: "Description must not exceed 2000 characters",
      })
      .optional(),
    placeType: placeTypeEnum.default("misc"),
    ...placePairFields,
  })
  // The saved_places table has no snapshot columns for the picked
  // place's name/address — the row's own name/address ARE the snapshot —
  // so the snapshot fields other place blocks carry are dropped here.
  .omit({ placeName: true, placeAddress: true });

/**
 * Validates saved-place creation data
 * - name: 1-255 characters (required)
 * - address: max 500 characters (optional, typed-word places carry no placeId)
 * - description: max 2000 characters (optional)
 * - placeType: one of the 9 event types (defaults to "misc")
 * - placeProvider + placeId: both-or-neither pair (no placeName/
 *   placeAddress snapshot fields — the stored name/address are it)
 */
export const createSavedPlaceSchema = baseSavedPlaceSchema.refine(
  isCompletePlacePair,
  {
    message: placePairIncompleteMessage,
    path: ["placeId"],
  },
);

/**
 * Validates saved-place update data (all fields optional)
 * - Allows partial updates to any saved-place field
 * - Same validation rules as createSavedPlaceSchema when fields are provided
 */
export const updateSavedPlaceSchema = baseSavedPlaceSchema
  .partial()
  .refine(isCompletePlacePair, {
    message: placePairIncompleteMessage,
    path: ["placeId"],
  });

/**
 * Validates saved-place pin/unpin data
 * - pinned: boolean flag
 */
export const pinSavedPlaceSchema = z.object({
  pinned: z.boolean(),
});

// --- Response schemas ---

/** Saved-place entity as returned by the API */
export const savedPlaceEntitySchema = z.object({
  id: z.string(),
  tripId: z.string(),
  createdBy: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  description: z.string().nullable(),
  placeType: placeTypeEnum,
  place: placeSummarySchema.nullable(),
  isPinned: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** GET /api/trips/:tripId/saved-places - Saved-place list */
export const savedPlaceListResponseSchema = z.object({
  success: z.literal(true),
  savedPlaces: z.array(savedPlaceEntitySchema),
});

/** GET/POST/PUT single saved place */
export const savedPlaceResponseSchema = z.object({
  success: z.literal(true),
  savedPlace: savedPlaceEntitySchema,
});

// Inferred TypeScript types from schemas
export type CreateSavedPlaceInput = z.infer<typeof createSavedPlaceSchema>;
export type UpdateSavedPlaceInput = z.infer<typeof updateSavedPlaceSchema>;
export type PinSavedPlaceInput = z.infer<typeof pinSavedPlaceSchema>;
