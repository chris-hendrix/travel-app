import type { EventType, ItineraryEvent } from "@/lib/itinerary";
import type { Stay } from "@/lib/stays";
import type { Trip } from "@/components/trip/TripCard";
import arts_and_entertainment from "@/assets/placeholders/arts.jpg";
import bachelor from "@/assets/placeholders/bachelor.jpg";
import beach from "@/assets/placeholders/beach.jpg";
import food_and_drink from "@/assets/placeholders/food.jpg";
import lodging from "@/assets/placeholders/lodging.jpg";
import misc from "@/assets/placeholders/misc.jpg";
import nightlife from "@/assets/placeholders/nightlife.jpg";
import outdoors from "@/assets/placeholders/outdoors.jpg";
import shopping from "@/assets/placeholders/shopping.jpg";
import travel from "@/assets/placeholders/travel.jpg";
import trip from "@/assets/placeholders/trip.jpg";
import wedding from "@/assets/placeholders/wedding.jpg";
import wellness from "@/assets/placeholders/wellness.jpg";

/**
 * What an image slot shows when there is no place photo: one bundled
 * stock photo per kind — the nine event types plus the trip cover's
 * own, plus the three landing occasions. Bundled, not remote, so the
 * fallback works offline; stock, not drawn, because hand-drawn line
 * art reads as a wireframe next to a real place photo. All thirteen
 * are Unsplash-licensed travel shots, free to use. (`PlaceholderImage`
 * renders them.)
 *
 * The three landing occasions are the exception to "one kind per event
 * type": a demo trip's cover has to be its own photo, or three cards
 * read as one card repeated.
 *
 * The occasion photos are the one place a bundled photo is chosen for
 * the *place* rather than for the kind: the demo's beach trip wears an
 * actual Cabo beach, its bachelor party a San Diego night skyline. That
 * is deliberate and it is the limit of it — each photo is still a
 * generic stock shot of that destination, never a photograph of a named
 * business. Real venue photos come from Google Places and may not be
 * cached or stored (only a `place_id` may), so no checked-in asset can
 * ever be one. See `lib/demo/adapter.ts` for the same line drawn around
 * the demo's place rows.
 *
 * Each photo's Unsplash id is recorded here, because a bundled photo
 * with no recorded source cannot be re-fetched, re-cropped or checked
 * for licensing later.
 */
/**
 * The three landing occasions. They are deliberately NOT `EventType`s —
 * nothing files an event under "bachelor" — they are a trip cover's own
 * slot, siblings of `"trip"`.
 */
export type OccasionKind = "beach" | "wedding" | "bachelor";

export type PlaceholderKind = EventType | "trip" | OccasionKind;

/**
 * One stock photo per kind. What matters here is that every member of
 * `PlaceholderKind` has one, so a new `EventType` — or a new occasion
 * — that forgets its photo fails typecheck instead of rendering
 * nothing: this is a total `Record<PlaceholderKind, number>`.
 *
 * Sources (Unsplash, free to use, no attribution required):
 * - `beach` — images.unsplash.com/photo-1654082982630-dafc123b7a91
 * - `wedding` — images.unsplash.com/photo-1732649124686-3bab54f79aa3
 * - `bachelor` — images.unsplash.com/photo-1546928351-30327386e845
 */
export const KINDS: Record<PlaceholderKind, number> = {
  lodging,
  food_and_drink,
  travel,
  outdoors,
  nightlife,
  wellness,
  shopping,
  arts_and_entertainment,
  misc,
  trip,
  beach,
  wedding,
  bachelor,
};

/** An event's fallback is the event's own type. */
export function placeholderKind(event: ItineraryEvent): EventType;
/** A stay's fallback is the lodging photo. */
export function placeholderKind(stay: Stay): "lodging";
/** A trip's fallback is the trip cover photo. */
export function placeholderKind(trip: Trip): "trip";
export function placeholderKind(
  value: ItineraryEvent | Stay | Trip,
): PlaceholderKind {
  if ("type" in value) return value.type;
  if ("title" in value) return "trip";
  return "lodging";
}
