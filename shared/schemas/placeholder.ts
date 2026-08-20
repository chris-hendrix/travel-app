// Placeholder member validation schemas for the Journiful platform

import { z } from "zod";
import { stripControlChars } from "../utils/sanitize";
import { phoneNumberSchema } from "./phone";

/**
 * Validates placeholder creation data
 * - name: 1-100 characters (required)
 * - phoneNumber: E.164 phone number (optional)
 */
export const createPlaceholderSchema = z.object({
  name: z
    .string()
    .min(1, {
      error: "Placeholder name must be at least 1 character",
    })
    .max(100, {
      error: "Placeholder name must not exceed 100 characters",
    })
    .transform(stripControlChars),
  phoneNumber: phoneNumberSchema.optional(),
});

/**
 * Validates placeholder update data (all fields optional)
 * - name: 1-100 characters
 * - phoneNumber: E.164 phone number
 */
export const updatePlaceholderSchema = z.object({
  name: z
    .string()
    .min(1, {
      error: "Placeholder name must be at least 1 character",
    })
    .max(100, {
      error: "Placeholder name must not exceed 100 characters",
    })
    .transform(stripControlChars)
    .optional(),
  phoneNumber: phoneNumberSchema.optional(),
});

// Inferred TypeScript types from schemas
export type CreatePlaceholderInput = z.infer<typeof createPlaceholderSchema>;
export type UpdatePlaceholderInput = z.infer<typeof updatePlaceholderSchema>;
