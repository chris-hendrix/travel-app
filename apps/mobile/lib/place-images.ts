/**
 * Place-photo image seam: one precedence in one helper.
 *
 * Every surface renders `upload → place photo → theme`: a trip's own
 * cover upload first, then the linked place's photo, then the
 * deterministic `placeholderPhoto` seed (the "theme" fallback, applied
 * by the caller when `url` is null — never here, so this helper can
 * report which source it chose).
 */

import type { PlaceBox, PlaceSummary } from "@journiful/shared/types";

/** Which source `coverImage` resolved to — what the slot renders. */
export type CoverSource = "upload" | "place" | "none";

/** A resolved cover: the URL (null when nothing beat the fallback). */
export type CoverImage = {
  url: string | null;
  source: CoverSource;
  /**
   * The photo's required Google Maps source link. Non-null whenever a
   * place photo resolves, so no caller can render a photo without the
   * link beside it.
   */
  photoSourceUri: string | null;
};

/** A photo base URL with its single named size segment. */
export function placePhotoUrl(base: string, box: PlaceBox): string {
  return `${base}${base.includes("?") ? "&" : "?"}size=${box}`;
}

/**
 * Resolve a slot's image. An upload wins over a place photo; a place
 * photo wins over the theme fallback; neither yields null (not the
 * placeholder) so the caller — `lib/mapping.ts` — applies
 * `placeholderPhoto(id)` itself and every slot falls back the same way.
 */
export function coverImage({
  coverImageUrl,
  place,
  id: _id,
  box = "card",
}: {
  coverImageUrl?: string | null | undefined;
  place?: PlaceSummary | null | undefined;
  id: string;
  box?: PlaceBox;
}): CoverImage {
  void _id;
  if (coverImageUrl) {
    return { url: coverImageUrl, source: "upload", photoSourceUri: null };
  }
  if (place?.photoUrl) {
    return {
      url: placePhotoUrl(place.photoUrl, box),
      source: "place",
      photoSourceUri: place.photoSourceUri ?? null,
    };
  }
  return { url: null, source: "none", photoSourceUri: null };
}

/**
 * The width at which the trip hero asks for the large box. The app has
 * no JS breakpoint constant — `lg` and `md` are Tailwind classes
 * invisible to JS — so the breakpoint lives here, next to the boxes.
 */
export const HERO_BOX_MIN_WIDTH = 960;

/** The photo box a layout width asks for: `hero` at and above the break. */
export function boxForWidth(width: number): PlaceBox {
  return width >= HERO_BOX_MIN_WIDTH ? "hero" : "card";
}

/**
 * The edit form's cover preview seed: the raw upload only, never the
 * resolved image. A trip with a place photo but no upload seeds to no
 * image — the `+` add-a-cover affordance — rather than to the Google
 * photo, which the user never added and must never be offered to delete.
 */
export function coverPreviewSeed(trip: { coverImageUrl: string | null }): string {
  return trip.coverImageUrl ?? "";
}
