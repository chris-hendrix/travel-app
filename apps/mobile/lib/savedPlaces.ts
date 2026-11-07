/**
 * The saved places' pure layer: chips, filters, order, and card slots.
 *
 * No React, no fetch, no react-native imports — node-importable like
 * `lib/saved-places.ts` and `lib/mapping.ts`, so all of it is
 * unit-testable in plain node (the mobile suite has no renderer).
 * Label rendering lives in the component: chips and the card carry the
 * raw `EventType` value, and the screen reads `EVENT_TYPE_LABEL` and
 * `EVENT_HUES` itself.
 *
 * A sibling of `lib/saved-places.ts`, not merged into it: that module
 * owns the entity shape, this one owns how a list of them reads.
 */

import type { EventType } from "@/lib/itinerary";
import type { SavedPlace } from "@/lib/saved-places";

/**
 * The filters the saved-places screen holds. `type` undefined or null
 * is the `All` chip — any type reads as a match.
 */
export type SavedPlacesFilters = {
  type?: EventType | null | undefined;
  pinnedOnly?: boolean;
  yoursOnly?: boolean;
};

/** The filters at rest: everything matches. */
export const EMPTY_SAVED_PLACES_FILTERS: SavedPlacesFilters = {};

/** A type chip's value: `All`, or the raw type the label map reads. */
export type SavedPlaceTypeChip = EventType | "All";

/**
 * The canonical event-type order, matching the `EventType` union in
 * `lib/itinerary.ts`. Chips follow this, never list appearance order,
 * so two lists with the same types always read the same chips.
 */
const CANONICAL_TYPE_ORDER: readonly EventType[] = [
  "travel",
  "food_and_drink",
  "arts_and_entertainment",
  "outdoors",
  "nightlife",
  "wellness",
  "shopping",
  "lodging",
  "misc",
];

/**
 * The chips for the list passed in. `All` always leads; one chip per
 * type present follows, in canonical event-type order.
 *
 * Derived from the WHOLE list, never the filtered one: the screen
 * throws these from the unfiltered snapshot, so a chip can never
 * vanish under the filter that chose it.
 */
export function typeChipsFor(
  places: readonly SavedPlace[],
): SavedPlaceTypeChip[] {
  const present = new Set<EventType>(
    places.map((place) => place.type),
  );
  return [
    "All",
    ...CANONICAL_TYPE_ORDER.filter((type) => present.has(type)),
  ];
}

/** True when any place is pinned — the screen hides the Pinned chip otherwise. */
export function hasAnyPinned(places: readonly SavedPlace[]): boolean {
  return places.some((place) => place.isPinned);
}

/**
 * Whether a place survives the filters for a viewer. The type filter
 * (undefined, null, or the `All` chip) matches any type, ANDed with
 * `pinnedOnly` and `yoursOnly` (`createdBy` is a user id, compared to
 * the viewer's user id — never a member id).
 */
export function matchesFilters(
  place: SavedPlace,
  filters: SavedPlacesFilters,
  viewerUserId: string,
): boolean {
  const type = filters.type;
  if (type !== undefined && type !== null && type !== ("All" as EventType)) {
    if (place.type !== type) return false;
  }
  if (filters.pinnedOnly && !place.isPinned) return false;
  if (filters.yoursOnly && place.createdBy !== viewerUserId) return false;
  return true;
}

/**
 * The list as the screen reads it: pinned cards first, then the rest,
 * each group in the order it already stood. A stable partition — the
 * wire carries no `pinnedAt`, so there is nothing to sort by, and
 * within each group the received order is the deterministic one (the
 * server answers pinned-first-then-newest, and optimistic edits keep
 * whatever order the cache already held).
 */
export function orderedPlaces(places: readonly SavedPlace[]): SavedPlace[] {
  return [
    ...places.filter((place) => place.isPinned),
    ...places.filter((place) => !place.isPinned),
  ];
}

/**
 * A saved place onto the card's slots, the `EventCard` bargain: the
 * badge and the placeholder kind are the raw type value (the component
 * reads `EVENT_TYPE_LABEL` and `EVENT_HUES`), `meta` is the creator
 * name verbatim, and a missing address is an empty footnote.
 *
 * `meta` is passed through untouched — "You" is the component's word
 * (`createdBy === viewerUserId`), never this layer's.
 */
export function savedPlaceCard(place: SavedPlace): {
  badge: EventType;
  meta: string;
  title: string;
  footnote: string;
  kind: EventType;
} {
  return {
    badge: place.type,
    meta: place.creatorName,
    title: place.name,
    footnote: place.address ?? "",
    kind: place.type,
  };
}
