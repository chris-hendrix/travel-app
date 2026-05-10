// POI (Point of Interest) validation schemas for the Journiful platform

import { z } from "zod";

/**
 * Schema for a single POI suggestion stored in the poi_cache JSONB blob
 */
export const poiSuggestionSchema = z.object({
  sourceId: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  distance: z.number(),
  category: z.enum([
    "food_and_drink",
    "arts_and_entertainment",
    "outdoors",
    "nightlife",
  ]),
  popularity: z.number().nullable(),
  price: z.number().nullable(),
  rating: z.number().nullable(),
  website: z.string().nullable(),
  tel: z.string().nullable(),
  subcategory: z.string().nullable(),
  eventId: z.string().nullable(),
});

/**
 * Schema for the response from GET /api/trips/:id/discover
 */
export const poiSuggestionsResponseSchema = z.object({
  destination: z.string().nullable(),
  source: z.string(),
  categories: z.record(
    z.enum(["food_and_drink", "arts_and_entertainment", "outdoors", "nightlife"]),
    z.array(poiSuggestionSchema),
  ),
  partial: z.boolean().optional(),
  errors: z.record(z.string(), z.string()).optional(),
});

export type POISuggestion = z.infer<typeof poiSuggestionSchema>;
export type POISuggestionsResponse = z.infer<typeof poiSuggestionsResponseSchema>;
