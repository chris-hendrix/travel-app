// Place validation schemas for the Journiful platform

import { z } from "zod";

export const placeProviderSchema = z.enum(["google"]);

export const placePairSchema = z.object({
  placeProvider: placeProviderSchema,
  placeId: z
    .string()
    .min(1, {
      error: "External place ID must be at least 1 character",
    })
    .max(512, {
      error: "External place ID must not exceed 512 characters",
    }),
});

export const placeBoxSchema = z.enum(["card", "hero"]);

/**
 * Optional place-block fields mixed into the trip/event/accommodation bases.
 * `placeProvider` + `placeId` is the both-or-neither pair matching
 * `place_cache`'s own (provider, place_id); `placeName`/`placeAddress`
 * are the independent user-picked snapshot strings, cleared with the pair.
 */
export const placePairFields = {
  placeProvider: placeProviderSchema.nullish(),
  placeId: z.string().min(1).max(512).nullish(),
  placeName: z.string().min(1).max(512).nullish(),
  placeAddress: z.string().min(1).max(512).nullish(),
};

/**
 * Both-or-neither check for the optional pair: a provider without an id
 * (or vice versa) is rejected, while absent (or both-null, i.e. clearing)
 * passes.
 */
export function isCompletePlacePair(data: {
  placeProvider?: unknown;
  placeId?: unknown;
}): boolean {
  const hasProvider = data.placeProvider != null;
  const hasId = data.placeId != null;
  return hasProvider === hasId;
}

export const placePairIncompleteMessage =
  "placeProvider and placeId must be provided together";

const cachedPhotoSchema = z
  .object({
    ref: z.string(),
    widthPx: z.number(),
    heightPx: z.number(),
    authorName: z.string().nullable(),
    authorUri: z.string().nullable(),
    authorPhotoUri: z.string().nullable(),
    mapsUri: z.string().nullable(),
  })
  .strict();

export const cachedPlaceDetailsSchema = z
  .object({
    v: z.literal(1),
    name: z.string(),
    address: z.string().nullable(),
    shortAddress: z.string().nullable(),
    lat: z.number().nullable(),
    lon: z.number().nullable(),
    photos: z.array(cachedPhotoSchema),
    country: z.string().nullable(),
  })
  .strict();

export const placeSummarySchema = z.object({
  placeId: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  photoUrl: z.string().nullable(),
  photoAttribution: z
    .object({
      name: z.string(),
      uri: z.string().nullable(),
      photoUri: z.string().nullable(),
    })
    .nullable(),
  photoSourceUri: z.string().nullable(),
  country: z.string().nullable(),
});

export type PlaceProvider = z.infer<typeof placeProviderSchema>;
export type PlacePair = z.infer<typeof placePairSchema>;
export type PlaceBox = z.infer<typeof placeBoxSchema>;
