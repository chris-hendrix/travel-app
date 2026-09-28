import type { EventType, ItineraryEvent } from "@/lib/itinerary";
import type { Stay } from "@/lib/stays";
import type { Trip } from "@/components/trip/TripCard";
import arts_and_entertainment from "@/assets/placeholders/arts.jpg";
import food_and_drink from "@/assets/placeholders/food.jpg";
import lodging from "@/assets/placeholders/lodging.jpg";
import misc from "@/assets/placeholders/misc.jpg";
import nightlife from "@/assets/placeholders/nightlife.jpg";
import outdoors from "@/assets/placeholders/outdoors.jpg";
import shopping from "@/assets/placeholders/shopping.jpg";
import travel from "@/assets/placeholders/travel.jpg";
import trip from "@/assets/placeholders/trip.jpg";
import wellness from "@/assets/placeholders/wellness.jpg";

/**
 * What an image slot shows when there is no place photo: one bundled
 * stock photo per kind — the nine event types plus the trip cover's
 * own. Bundled, not remote, so the fallback works offline; stock, not
 * drawn, because hand-drawn line art reads as a wireframe next to a
 * real place photo. All ten are Unsplash-licensed travel shots, free
 * to use. (`PlaceholderImage` renders them.)
 */
export type PlaceholderKind = EventType | "trip";

/**
 * One stock photo per kind. What matters here is that every member of
 * `PlaceholderKind` has one, so a new `EventType` that forgets its
 * photo fails the placeholder test instead of rendering nothing.
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
