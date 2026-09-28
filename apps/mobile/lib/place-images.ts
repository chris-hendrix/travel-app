/**
 * Place-photo image seam: one precedence in one helper.
 *
 * Every surface renders `upload → place photo → tile`: a trip's own
 * cover upload first, then the linked place's photo, then null —
 * the caller renders the kind's stock photo, so this helper can
 * report which source it chose.
 */

import type { PlaceBox, PlaceSummary } from "@journiful/shared/types";
import { resolveUploadUrl } from "@/lib/uploads";

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

/**
 * A photo base URL with its single named size segment.
 *
 * The API hands `photoUrl` back as a ROOT-RELATIVE path
 * (`/api/locations/photos/<ref>`). Rendered as-is, an `<Image>`
 * resolves that against whatever origin the app happens to run on —
 * `localhost:8081` under Expo web, which answers 404 with the app's own
 * index HTML, so the slot paints blank while the credit beside it still
 * renders. Prefixing is the client's job for the same reason it is in
 * `lib/uploads.ts`, which is where uploads get the identical treatment;
 * that helper passes `http(s)`, `blob:`, `file:` and `data:` through
 * untouched, so an already-absolute base is unaffected.
 */
export function placePhotoUrl(base: string, box: PlaceBox): string {
  const absolute = resolveUploadUrl(base) ?? base;
  return `${absolute}${absolute.includes("?") ? "&" : "?"}size=${box}`;
}

/**
 * Resolve a slot's image. An upload wins over a place photo;
 * neither yields a photo — null means no photo, and the caller
 * renders the kind's stock photo, so every slot falls back the same way.
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
 * The slot decision, pure so the fallback is testable in node: a photo
 * wins over the kind's stock photo; a missing image (null,
 * undefined, or empty) or a failed one (a 404 or undecodable photo)
 * yields the placeholder — never a blank box.
 */
export type ImageSlot = { kind: "photo"; url: string } | { kind: "placeholder" };

/** Resolve a slot's image: the photo when there is one, else the placeholder. */
export function imageSlot(input: {
  image: string | null | undefined;
  failed?: boolean;
}): ImageSlot {
  if (input.image && !input.failed) {
    return { kind: "photo", url: input.image };
  }
  return { kind: "placeholder" };
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

/** A place-photo credit: the author's name and their profile link. */
export type PlacePhotoCredit = {
  name: string;
  uri: string | null;
};

/**
 * The credit a detail surface renders under a place photo —
 * `Photo by <name>` linking to `uri`. Null when there is nothing to
 * credit: no place, no photo, or an empty author name. A null `uri`
 * passes through rather than inventing a link. Tiles render nothing:
 * the policy's thumbnail exemption holds because every tile taps
 * through to a detail view that carries this credit — so if a tile ever
 * becomes the *only* place its photo appears, the credit must move
 * onto the tile (see the manual layout pass).
 *
 * The author's avatar (`photoUri`) is deliberately not returned: the
 * credit is a single 12sp line.
 */
export function placePhotoCredit(
  place: PlaceSummary | null | undefined,
): PlacePhotoCredit | null {
  const name = place?.photoAttribution?.name?.trim();
  if (!name) return null;
  return { name, uri: place?.photoAttribution?.uri ?? null };
}
