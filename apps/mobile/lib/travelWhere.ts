/**
 * The `Where` field's suggestion list, ranked from strings we already
 * hold (D6).
 *
 * Three sources, in this order: this trip's own wheres (both ends of
 * every filed leg), the trip's destination, and the caller's locations
 * from their other trips — the cross-trip source is the one thing the
 * screen cannot read off its own cache, which is why the API gained
 * `GET /member-travel/locations` for it.
 *
 * No query parameter, deliberately. The keystroke lives in
 * `Dropdown` (a local list filters itself), and the only way to hand it
 * up here is `onSearchText` — the live-search shape
 * `travel-where-source.test.ts` exists to keep out of the travel files.
 * `freeText` already commits what you type, so a typed row would be a
 * row nobody needs. See the note in `__tests__/travel-where.test.ts`.
 *
 * Pure and framework-free (the `lib/dropdown.ts` precedent) so the
 * order, the dedupe and the provenance are all unit-testable.
 */

import {
  getCounterpartLocation,
  getPertinentLocation,
} from "@journiful/shared/utils";
import type { PickerEntry } from "@/lib/dropdown";

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
 * The rows `Where` offers, in order: this trip's own wheres, its
 * destination, then the caller's other-trip wheres. Deduped
 * case-insensitively — "BCN T2" and "bcn t2" are one airport — and
 * trimmed, so every value is something a person could have meant.
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
