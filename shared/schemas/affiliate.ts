import { z } from "zod";

export const suggestionPartnerSchema = z.object({
  slug: z.string(),
  name: z.string(),
});

export const suggestionCardSchema = z.object({
  id: z.string(),
  gapType: z.enum([
    "missing_travel",
    "no_accommodation",
    "empty_day",
    "missing_meal",
  ]),
  suggestionType: z.enum(["flights", "hotels", "attractions"]),
  title: z.string(),
  description: z.string(),
  affiliateUrl: z.string(),
  partner: suggestionPartnerSchema,
  dismissKey: z.string(),
  day: z.string().nullable(),
  priority: z.number(),
});

export const suggestionsResponseSchema = z.object({
  success: z.literal(true),
  suggestions: z.array(suggestionCardSchema),
});

export const dismissSuggestionSchema = z.object({
  suggestionType: z.string().min(1).max(50),
  suggestionKey: z.string().min(1).max(100),
});

export type DismissSuggestionInput = z.infer<typeof dismissSuggestionSchema>;

export const trackClickSchema = z.object({
  partnerSlug: z.string().min(1).max(50),
  tripId: z.string().uuid(),
  suggestionType: z.string().min(1).max(50),
  affiliateUrl: z.string().url(),
});

export type TrackClickInput = z.infer<typeof trackClickSchema>;

export const trackImpressionsSchema = z.object({
  impressions: z
    .array(
      z.object({
        partnerSlug: z.string().min(1).max(50),
        suggestionType: z.string().min(1).max(50),
      }),
    )
    .min(1)
    .max(10),
});

export type TrackImpressionsInput = z.infer<typeof trackImpressionsSchema>;
