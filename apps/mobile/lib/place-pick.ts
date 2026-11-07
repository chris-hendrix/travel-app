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

/**
 * What tapping a picker row commits for a saved place: the snapshot
 * the API stores — a name apart from its address, the place id
 * (null for the typed row), and the place type the suggestion's
 * Google types imply. Pure, like `pickPlace`, so the pick never waits
 * on the details lookup.
 */
export type SavedPlacePick = {
  name: string;
  address: string | null;
  placeId: string | null;
  placeType: EventType;
};

/**
 * The tapped row's answer. A live suggestion commits Google's main
 * text (`shortName`) as the name and keeps the address beside it —
 * not the row's full display text, which is the event field's answer
 * and would repeat the address inside the name here. The typed text
 * commits its own words with no place id and no address. The type
 * comes off the suggestion's Google types; typed text is unclassified.
 *
 * The caller resolves the tap first (`liveById.get(picked) ?? null`,
 * as EventDialog does): a typed tap carries the raw text, never a
 * place id, so it answers `null` here even while live suggestions sit
 * in the list — and the typed row wins by never reaching the live
 * branch.
 */
export function pickSavedPlace(
  suggestion: PlaceSuggestion | null,
  typedText: string,
): SavedPlacePick {
  if (suggestion) {
    return {
      name: suggestion.shortName,
      address: suggestion.address,
      placeId: suggestion.placeId,
      placeType: eventTypeForPlace(suggestion.types ?? []),
    };
  }
  return { name: typedText, address: null, placeId: null, placeType: "misc" };
}

