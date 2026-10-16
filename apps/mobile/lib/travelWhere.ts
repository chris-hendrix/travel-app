/**
 * The `Where` field's suggestion list: live Places results merged with the
 * strings we already hold.
 *
 * Two halves, one list. `travelWhereRows` assembles it: Google's answers
 * first, then `travelWhere`'s ranking of this trip's own wheres, its
 * destination, and the caller's locations from their other trips — the
 * cross-trip source being the one thing the screen cannot read off its own
 * cache, which is why the API gained `GET /member-travel/locations` for it.
 *
 * The keystroke is `travelWhereRows`' argument and `TravelWhereField`'s
 * state. It crosses that boundary through `onSearchText`, which the live
 * half also requires: the provider renames a row while you type, so the
 * local substring filter — which `liveOptions` skips — would hide the row
 * you are looking at. Nothing here holds a keystroke.
 *
 * Pure and framework-free (the `lib/dropdown.ts` precedent) so the order,
 * the dedupe and the provenance are all unit-testable.
 */

import {
  getCounterpartLocation,
  getPertinentLocation,
} from "@journiful/shared/utils";
import type { PickerEntry } from "@/lib/dropdown";
import {
  placePickerRows,
  type PlaceSuggestion,
} from "@/lib/queries/places";

/** The record columns the ranking reads — both `MockTravel` and the
 *  wire row carry them. */
export type WhereRecord = {
  travelType: "arrival" | "departure";
  arrivalLocation: string | null;
  departureLocation: string | null;
};

/** What the ranking needs of a trip: the destination it was created with. */
export type WhereTrip = { location: string | null };

/** Where the destination row came from. */
export const DESTINATION_PROVENANCE = "This trip";

/** Where the cross-trip rows came from — the one value the label cannot
 *  tell you on its own, since nothing else on this screen mentions
 *  another trip. */
export const OTHER_TRIPS_PROVENANCE = "From your other trips";

/**
 * The `Where` field's rows for one query: Google's answers, then the
 * strings this trip already holds, then the text being typed.
 *
 * One rule runs the whole list: **one row per string.** Two rows that read
 * the same are one answer, and the first source to offer it keeps it. That
 * is not a tidy-up — a live row's value *is* its reading here, because
 * travel asks `placePickerRows` for `commit: "shortName"`, and `Dropdown`'s
 * list keys a drawn row by its value. Two rows sharing one value would
 * collide, and a press resolves against the rows that were drawn, so the
 * string has to appear exactly once whatever else happens.
 *
 * The consequence, since it is visible: two Google results with the same
 * short name — two branches of one chain, which is where this actually
 * happens — resolve to whichever ranked first, and a string this trip has
 * already filed beats the typed row saying the same words. Both commit
 * the same text either way; only one of them is drawn.
 *
 * The order is the argument. Google's results lead in Google's own
 * relevance order; then `travelWhere`'s ranking — this trip's own wheres,
 * its destination, the caller's other trips — filtered by the same
 * `includes` rule a local list uses and visibly marked as such, because a
 * trip's own vocabulary is a different fact from a place Google knows;
 * and last the typed text, which is where it belongs: a fallback, under
 * the things that are answers rather than words still being chosen.
 *
 * Text only, throughout. `commit: "shortName"` is what makes that true — a
 * live row commits the place's own tight reading rather than a placeId, so
 * no id leaves this function for anything downstream to save. Travel's
 * locations are `text` and stay `text`; see `travel-place-metadata.test.ts`.
 *
 * A blank query offers nothing, the `placePickerRows` rule: the field
 * closes on an empty value, and the rows that would answer a blank one are
 * the whole local list rather than a suggestion.
 */
export function travelWhereRows({
  local,
  suggestions,
  query,
  isFetching = false,
  isError = false,
}: {
  /** This trip's own wheres and the caller's, already ranked and deduped. */
  local: readonly PickerEntry[];
  /** Undefined while the live lookup has not answered yet. */
  suggestions: PlaceSuggestion[] | undefined;
  query: string;
  isFetching?: boolean;
  isError?: boolean;
}): PickerEntry[] {
  const trimmed = query.trim();
  if (trimmed === "") return [];

  const built = placePickerRows({
    suggestions,
    query: trimmed,
    isFetching,
    isError,
    // The placeId is deliberately not committed: a leg keeps the place's
    // own short reading — "Humberto Delgado Airport (LIS)", not the id
    // and not the display name with its street address on the end.
    commit: "shortName",
  });
  // `placePickerRows` pins the typed row among the live ones. It is the
  // one row here that is not an answer to the query but the words of it.
  const typed = built.rows.filter((row) => row.fieldText !== undefined);
  const live = built.rows.filter((row) => row.fieldText === undefined);
  const needle = trimmed.toLowerCase();

  const rows: PickerEntry[] = [];
  const seen = new Set<string>();
  function take(entry: PickerEntry): void {
    const identity = rowIdentity(entry);
    if (identity === "" || seen.has(identity)) return;
    seen.add(identity);
    rows.push(entry);
  }

  for (const entry of live) take(entry);
  for (const entry of local) {
    if (entry.label.toLowerCase().includes(needle)) take(entry);
  }
  for (const entry of typed) take(entry);

  return rows;
}

/**
 * What a row is *one of* across the two halves of the list: what a person
 * reads, which on this field is also what the row commits.
 */
function rowIdentity(entry: PickerEntry): string {
  return (entry.fieldText ?? entry.label).trim().toLowerCase();
}

/**
 * The rows `Where` offers from our own strings, in order: this trip's own
 * wheres, its destination, then the caller's other-trip wheres. Deduped
 * case-insensitively — "BCN T2" and "bcn t2" are one airport — and
 * trimmed, so every value is something a person could have meant.
 *
 * The local half of `travelWhereRows`, and the reason the field answers
 * with a trip's own vocabulary and not only with what Google knows.
 */
export function travelWhere<T extends WhereRecord>(
  records: readonly T[],
  trip: WhereTrip | null | undefined,
  otherLocations: readonly string[],
): PickerEntry[] {
  const seen = new Set<string>();
  const rows: PickerEntry[] = [];

  function add(value: string | null | undefined, secondary?: string): void {
    const location = value?.trim();
    if (!location) return;
    const key = location.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(
      secondary
        ? { value: location, label: location, secondary }
        : { value: location, label: location },
    );
  }

  for (const record of records) {
    // The record's own end leads its counterpart: the end the member
    // filed, before the one a flight lookup filled in silently. Both
    // count — a leg holds both ends, and either is a place they may be
    // flying to again.
    add(getPertinentLocation(record));
    add(getCounterpartLocation(record));
  }
  add(trip?.location, DESTINATION_PROVENANCE);
  for (const location of otherLocations) {
    add(location, OTHER_TRIPS_PROVENANCE);
  }

  return rows;
}
