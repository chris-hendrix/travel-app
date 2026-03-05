// Phone number validation for the Tripful platform

import { z } from "zod";

/**
 * E.164 phone number regex
 * Format: +[country code][number] (e.g., +14155552671)
 * - Must start with '+'
 * - First digit cannot be 0
 * - Total digits: 2-15 (per E.164 standard)
 */
export const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * Validates phone numbers in E.164 format
 */
export const phoneNumberSchema = z.string().regex(PHONE_REGEX, {
  error: "Phone number must be in E.164 format (e.g., +14155552671)",
});
