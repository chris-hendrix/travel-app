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
 * The tapped row's answer. A live suggestion commits the row's FULL
 * display text — the name and the address together, exactly the string
 * the row carried — so the field echoes what was tapped and needs no
 * second line under it to say the rest. The typed text commits itself
 * with no place id. The type comes off the suggestion's Google types
 * (`restaurant` → `food_and_drink`); typed text is unclassified.
 *
 * `stayArea` reads the LAST comma-separated segment of a stay's
 * address, so a name leading the string does not disturb it.
 */
export function pickPlace(
  suggestion: PlaceSuggestion | null,
  typedText: string,
): PlacePick {
  if (suggestion) {
    return {
      place: suggestion.name,
      selectedPlaceId: suggestion.placeId,
      type: eventTypeForPlace(suggestion.types ?? []),
    };
  }
  return { place: typedText, selectedPlaceId: null, type: "misc" };
}

