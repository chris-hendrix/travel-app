// Authentication validation schemas for the Tripful platform

import { z } from "zod";
import { stripControlChars } from "../utils/sanitize";

/**
 * Validates phone number for requesting verification code
 * - Length: 10-20 characters
 * - Used for SMS-based authentication
 */
export const requestCodeSchema = z.object({
  phoneNumber: z
    .string()
    .min(10, {
      error: "Phone number must be at least 10 characters",
    })
    .max(20, {
      error: "Phone number must not exceed 20 characters",
    }),
});

/**
 * Validates phone number and verification code for authentication
 * - Phone number: 10-20 characters
 * - Code: exactly 6 digits
 */
export const verifyCodeSchema = z.object({
  phoneNumber: z
    .string()
    .min(10, {
      error: "Phone number must be at least 10 characters",
    })
    .max(20, {
      error: "Phone number must not exceed 20 characters",
    }),
  code: z
    .string()
    .length(6, {
      error: "Verification code must be exactly 6 characters",
    })
    .regex(/^\d{6}$/, {
      error: "Verification code must contain only digits",
    }),
});

/**
 * Validates user profile information during onboarding
 * - Display name: 3-50 characters (required)
 * - Timezone: IANA timezone string (optional)
 */
export const completeProfileSchema = z.object({
  displayName: z
    .string()
    .min(3, {
      error: "Display name must be at least 3 characters",
    })
    .max(50, {
      error: "Display name must not exceed 50 characters",
    })
    .transform(stripControlChars),
  timezone: z.string().max(100).nullable().optional(),
});

// --- Response schemas ---

/** User entity as returned by the API (timestamps serialized as ISO strings) */
export const userResponseSchema = z.object({
  id: z.string(),
  phoneNumber: z.string(),
  displayName: z.string(),
  profilePhotoUrl: z.string().nullable().optional(),
  timezone: z.string().nullable(),
  handles: z.record(z.string(), z.string()).nullable().optional(),
  temperatureUnit: z.enum(["celsius", "fahrenheit"]).nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const requestCodeResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const verifyCodeResponseSchema = z.object({
  success: z.literal(true),
  user: userResponseSchema,
  requiresProfile: z.boolean(),
});

export const completeProfileResponseSchema = z.object({
  success: z.literal(true),
  user: userResponseSchema,
});

export const getMeResponseSchema = z.object({
  success: z.literal(true),
  user: userResponseSchema,
});

export const logoutResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

// Inferred TypeScript types from schemas
export type RequestCodeInput = z.infer<typeof requestCodeSchema>;
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;
export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;
