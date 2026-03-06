// Mutuals validation schemas for the Tripful platform

import { z } from "zod";

/**
 * Query parameters for GET /api/mutuals
 * - tripId: optional filter by specific trip
 * - search: optional prefix search on display name
 * - cursor: opaque pagination cursor
 * - limit: page size (default 20, max 50)
 */
export const getMutualsQuerySchema = z.object({
  tripId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
});

/**
 * Query parameters for GET /api/trips/:tripId/mutual-suggestions
 * - search: optional prefix search on display name
 * - cursor: opaque pagination cursor
 * - limit: page size (default 20, max 50)
 */
export const getMutualSuggestionsQuerySchema = z.object({
  search: z.string().max(100).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
});

/**
 * Response schema for GET /api/mutuals and GET /api/trips/:tripId/mutual-suggestions
 * Both endpoints return the same paginated mutuals shape
 */
const sharedTripSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const mutualEntitySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  profilePhotoUrl: z.string().nullable(),
  sharedTripCount: z.number(),
  sharedTrips: z.array(sharedTripSchema),
});

export const getMutualsResponseSchema = z.object({
  success: z.literal(true),
  mutuals: z.array(mutualEntitySchema),
  nextCursor: z.string().nullable(),
});

// Inferred TypeScript types from schemas
export type GetMutualsQueryInput = z.infer<typeof getMutualsQuerySchema>;
export type GetMutualSuggestionsQueryInput = z.infer<
  typeof getMutualSuggestionsQuerySchema
>;
export type GetMutualsResponse = z.infer<typeof getMutualsResponseSchema>;
