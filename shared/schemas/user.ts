// User profile validation schemas for the Tripful platform

import { z } from "zod";
import { stripControlChars } from "../utils/sanitize";

/** Allowed social media handle platforms */
export const ALLOWED_HANDLE_PLATFORMS = ["venmo", "instagram"] as const;
export type HandlePlatform = (typeof ALLOWED_HANDLE_PLATFORMS)[number];

/**
 * Validates user social media handles
 * - Keys must be one of the allowed platforms (venmo, instagram)
 * - Values are handle strings up to 100 characters
 */
export const userHandlesSchema = z
  .record(z.string(), z.string().max(100))
  .refine(
    (obj) =>
      Object.keys(obj).every((k) =>
        ALLOWED_HANDLE_PLATFORMS.includes(k as HandlePlatform),
      ),
    { message: "Only venmo and instagram handles are supported" },
  )
  .optional()
  .nullable();

/**
 * Validates user profile update data
 * - displayName: 3-50 characters (optional)
 * - timezone: IANA timezone string or null for auto-detect (optional)
 * - handles: social media handles object (optional)
 */
export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(3, {
      error: "Display name must be at least 3 characters",
    })
    .max(50, {
      error: "Display name must not exceed 50 characters",
    })
    .transform(stripControlChars)
    .optional(),
  timezone: z.string().max(100).nullable().optional(),
  handles: userHandlesSchema,
});

// Inferred TypeScript types from schemas
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
