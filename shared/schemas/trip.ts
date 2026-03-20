// Trip validation schemas for the Journiful platform

import { z } from "zod";
import { phoneNumberSchema } from "./phone";
import { stripControlChars } from "../utils/sanitize";
import { THEME_IDS } from "../config/themes";
import { THEME_FONT_VALUES } from "../types/theme";

/**
 * Validates IANA timezone strings using Intl.supportedValuesOf
 * - Uses runtime validation against the list of supported timezones
 * - Examples: 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'UTC'
 * - Note: 'UTC' is manually added as it's commonly used but not in Intl list
 */
const ianaTimezones = [...Intl.supportedValuesOf("timeZone"), "UTC"];
const timezoneSchema = z.string().refine((tz) => ianaTimezones.includes(tz), {
  message: "Invalid IANA timezone identifier",
});

/**
 * Base trip data schema (without cross-field validation)
 * - Used as the foundation for both create and update schemas
 */
const baseTripSchema = z.object({
  name: z
    .string()
    .min(3, {
      error: "Trip name must be at least 3 characters",
    })
    .max(100, {
      error: "Trip name must not exceed 100 characters",
    })
    .transform(stripControlChars),
  destination: z
    .string()
    .min(1, {
      error: "Destination is required",
    })
    .max(255, {
      error: "Destination must not exceed 255 characters",
    })
    .transform(stripControlChars),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  timezone: timezoneSchema,
  description: z
    .string()
    .max(2000, {
      error: "Description must not exceed 2000 characters",
    })
    .transform(stripControlChars)
    .optional(),
  coverImageUrl: z
    .string()
    .max(2048, {
      error: "Cover image URL must not exceed 2048 characters",
    })
    .refine(
      (val) => {
        // Allow paths starting with / (but not protocol-relative URLs like //example.com)
        if (val.startsWith("/") && !val.startsWith("//")) return true;
        // Require full URLs with protocol (http:// or https://)
        try {
          const url = new URL(val);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      },
      {
        message:
          "Cover image must be a valid URL with protocol (http:// or https://) or a path starting with /",
      },
    )
    .nullable()
    .optional(),
  allowMembersToAddEvents: z.boolean().default(true),
  showAllMembers: z.boolean().default(false),
  coOrganizerPhones: z.array(phoneNumberSchema).optional(),
  themeId: z.enum(THEME_IDS).nullable().optional(),
  themeFont: z.enum(THEME_FONT_VALUES).nullable().optional(),
});

/**
 * Validates trip creation data
 * - name: 3-100 characters (required)
 * - destination: 1+ characters (required)
 * - startDate: optional ISO date string (YYYY-MM-DD)
 * - endDate: optional ISO date string (YYYY-MM-DD), must be >= startDate
 * - timezone: IANA timezone string (required)
 * - description: max 2000 characters (optional)
 * - coverImageUrl: optional URL or null
 * - allowMembersToAddEvents: boolean (defaults to true)
 * - coOrganizerPhones: array of E.164 phone numbers (optional)
 */
export const createTripSchema = baseTripSchema.refine(
  (data) => {
    // Cross-field validation: endDate must be >= startDate
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) >= new Date(data.startDate);
    }
    return true;
  },
  {
    message: "End date must be on or after start date",
    path: ["endDate"],
  },
);

/**
 * Validates trip update data (all fields optional)
 * - Allows partial updates to any trip field
 * - Same validation rules as createTripSchema when fields are provided
 */
export const updateTripSchema = baseTripSchema.partial().refine(
  (data) => {
    // Cross-field validation: endDate must be >= startDate (when both provided)
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) >= new Date(data.startDate);
    }
    return true;
  },
  {
    message: "End date must be on or after start date",
    path: ["endDate"],
  },
);

/**
 * Validates adding a co-organizer to a trip
 * - phoneNumber: E.164 format phone number (required)
 */
export const addCoOrganizerSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

/**
 * Validates cursor-based pagination query parameters
 * - cursor: opaque base64url-encoded string (optional, omit for first page)
 * - limit: integer 1-100, defaults to 20
 * Uses z.coerce for limit to handle string query params from URLs
 */
export const cursorPaginationSchema = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// --- Response schemas ---

/** Generic success-only response (used by DELETE endpoints) */
export const successResponseSchema = z.object({
  success: z.literal(true),
});

/** Base trip entity as returned by the API */
const tripEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  destination: z.string(),
  destinationLat: z.number().nullable(),
  destinationLon: z.number().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  preferredTimezone: z.string(),
  description: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  themeId: z.string().nullable(),
  themeFont: z.string().nullable(),
  createdBy: z.string(),
  allowMembersToAddEvents: z.boolean(),
  showAllMembers: z.boolean(),
  cancelled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** Organizer info in trip summary */
const organizerInfoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  profilePhotoUrl: z.string().nullable(),
});

/** Trip summary as returned by GET /api/trips (list) */
const tripSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  destination: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  themeId: z.string().nullable(),
  themeFont: z.string().nullable(),
  isOrganizer: z.boolean(),
  rsvpStatus: z.enum(["going", "not_going", "maybe", "no_response"]),
  organizerInfo: z.array(organizerInfoSchema),
  memberCount: z.number(),
  eventCount: z.number(),
});

/** Organizer detail in trip detail */
const organizerDetailSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  phoneNumber: z.string().optional(),
  profilePhotoUrl: z.string().nullable(),
  timezone: z.string().nullable(),
});

/** Trip detail entity (extends trip with organizers and member count)
 *  In preview mode, some fields (createdBy, allowMembersToAddEvents, cancelled,
 *  createdAt, updatedAt) are omitted for non-Going members. */
const tripDetailSchema = tripEntitySchema
  .partial({
    createdBy: true,
    allowMembersToAddEvents: true,
    showAllMembers: true,
    cancelled: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    organizers: z.array(organizerDetailSchema),
    memberCount: z.number(),
  });

/** GET /api/trips - Paginated trip list (cursor-based) */
export const tripListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(tripSummarySchema),
  meta: z.object({
    total: z.number(),
    limit: z.number(),
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
});

/** GET /api/trips/:id - Trip detail */
export const tripDetailResponseSchema = z.object({
  success: z.literal(true),
  trip: tripDetailSchema,
  isPreview: z.boolean().optional(),
  userRsvpStatus: z
    .enum(["going", "not_going", "maybe", "no_response"])
    .optional(),
  isOrganizer: z.boolean().optional(),
});

/** POST/PUT /api/trips, cover image upload/delete */
export const tripResponseSchema = z.object({
  success: z.literal(true),
  trip: tripEntitySchema,
});

// Inferred TypeScript types from schemas
export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;
export type AddCoOrganizerInput = z.infer<typeof addCoOrganizerSchema>;
export type CursorPaginationInput = z.infer<typeof cursorPaginationSchema>;
