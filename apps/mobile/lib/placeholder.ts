import type { EventType, ItineraryEvent } from "@/lib/itinerary";
import type { Stay } from "@/lib/stays";
import type { Trip } from "@/components/trip/TripCard";

/**
 * What the illustrated tile draws when there is no place photo: the
 * nine event types plus the trip cover's own kind. The kinds are
 * distinguished by drawing, not by colour — the chip beside the tile
 * already names the category.
 */
export type PlaceholderKind = EventType | "trip";

/**
 * One drawing per kind. The value names the drawing
 * (`PlaceholderTile` renders it); what matters here is that every
 * member of `PlaceholderKind` has one, so a new `EventType` that
 * forgets its drawing fails the placeholder test instead of
 * rendering nothing.
 */
export const KINDS: Record<PlaceholderKind, string> = {
  lodging: "bed",
  food_and_drink: "plate",
  travel: "paper-plane",
  outdoors: "mountains",
  nightlife: "tumbler",
  wellness: "lotus",
  shopping: "bag",
  arts_and_entertainment: "frame",
  misc: "pin",
  trip: "compass",
};

/** An event's tile draws the event's own type. */
export function placeholderKind(event: ItineraryEvent): EventType;
/** A stay's tile draws the lodging drawing. */
export function placeholderKind(stay: Stay): "lodging";
/** A trip's tile draws the compass. */
export function placeholderKind(trip: Trip): "trip";
export function placeholderKind(
  value: ItineraryEvent | Stay | Trip,
): PlaceholderKind {
  if ("type" in value) return value.type;
  if ("title" in value) return "trip";
  return "lodging";
}
