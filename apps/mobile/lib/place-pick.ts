import { eventTypeForPlace } from "@journiful/shared/utils";
import type { EventType } from "@/lib/itinerary";
import type { PlaceSuggestion } from "@/lib/queries/places";

/**
 * What tapping a picker row commits: the row's own label, its place id
 * (null for the typed row), and the event type its Google types imply.
 * Pure, so the pick never waits on the details lookup — details resolve
 * coordinates only, never the label.
 */
export type PlacePick = {
  place: string;
  selectedPlaceId: string | null;
  type: EventType;
};

/**
 * The tapped row's answer. A live suggestion commits its short name
 * with its place id; the typed text commits itself with none. The type
 * comes off the suggestion's Google types (`restaurant` →
 * `food_and_drink`); typed text is unclassified.
 */
export function pickPlace(
  suggestion: PlaceSuggestion | null,
  typedText: string,
): PlacePick {
  if (suggestion) {
    return {
      place: suggestion.shortName,
      selectedPlaceId: suggestion.placeId,
      type: eventTypeForPlace(suggestion.types ?? []),
    };
  }
  return { place: typedText, selectedPlaceId: null, type: "misc" };
}

/**
 * A stay's Address after a pick: the details lookup's formatted address
 * wins (it is what `stayArea` reads the town off and what the maps link
 * searches), falling back to the suggestion's own address while details
 * are still in flight. Never the place's name — a name in the address
 * column makes `stayArea` return nonsense.
 */
export function pickStayAddress(
  suggestion: Pick<PlaceSuggestion, "address">,
  detailsAddress: string | null,
): string {
  return detailsAddress ?? suggestion.address;
}

export type StaySelection = {
  /**
   * The Name field's next value on a live pick: the suggestion's
   * short name, which is exactly what the two-line picker row shows.
   * Null on the typed row, which leaves the user's own words alone —
   * only a pick writes the name, so typing after picking keeps it.
   */
  name: string | null;
  address: string;
};

/**
 * A stay dialog pick as Name + Address. A live suggestion commits its
 * short name with the details address (or its own while details are
 * still in flight); typed text commits itself as the address with no
 * name change.
 */
export function pickStaySelection(
  suggestion: PlaceSuggestion | null,
  typedText: string,
  detailsAddress: string | null,
): StaySelection {
  if (suggestion) {
    return {
      name: suggestion.shortName,
      address: detailsAddress ?? suggestion.address,
    };
  }
  return { name: null, address: typedText };
}
