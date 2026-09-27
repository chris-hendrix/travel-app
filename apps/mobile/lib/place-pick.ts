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

