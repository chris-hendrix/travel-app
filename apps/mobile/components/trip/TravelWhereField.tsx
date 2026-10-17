import { useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import {
  biasForTrip,
  countryForTrip,
  usePlaceSessionToken,
  usePlaceSuggestions,
} from "@/lib/queries/places";
import { travelWhereRows } from "@/lib/travelWhere";
import type { PickerEntry } from "@/lib/dropdown";
import type { Trip } from "@/components/trip/TripCard";

/**
 * The travel `Where` field: a Places autocomplete whose answer is text.
 *
 * It is a component of its own so that the one thing travel does
 * differently from the stay, event and trip pickers is said in one
 * place — it never learns a place id. The rows are asked to commit each
 * live result's own whole reading (`commit: "name"`, `placePickerRows`),
 * so what the field hands back, and therefore what the leg holds, what
 * the board prints and what the API stores, is the name and the address
 * together and nothing else: no details lookup, no coordinates, no
 * snapshot, no id to save. The address is the point of keeping the
 * provider's own string: a where is read back on the board and on the
 * leg's own sheet, and "Humberto Delgado Airport (LIS)" is a place to go
 * and search for where the address under it is the way there.
 *
 * It is still a live Places field, and that has consequences it cannot
 * opt out of. The search carries the trip's own coordinates as a ~50 km
 * bias and its country as a floor when it has one — the same pair the
 * other in-trip pickers use, so "Terminal 2" answers with the terminal
 * near this trip. The Google mark renders under the rows, because they
 * are Google's: attribution is the condition the results are drawn
 * under, not a decoration, and it is the one thing here that is not a
 * choice (`Dropdown`'s `attribution`).
 *
 * One session token for the field's whole life, never rotated. Rotation
 * closes a session that a `Place Details` call ends, and this field
 * makes none — there is no place to look up, which is exactly what makes
 * the field text-only.
 *
 * `whereEntries` is the other half of the list: this trip's own wheres,
 * its destination and the caller's locations from other trips, ranked by
 * `travelWhere` and merged behind Google's rows (`travelWhereRows`). The
 * field therefore still answers with the trip's own vocabulary when the
 * lookup is unavailable, which CI is: the suite carries no Maps key, so
 * the live half degrades to a status row and these rows are what is
 * left — with the typed row beneath them.
 */
export function TravelWhereField({
  label,
  trip,
  whereEntries,
  value,
  onChange,
  placeholder,
  error,
}: {
  /** The end's own word for this field, from the mode's table. */
  label: string;
  /** The trip the leg belongs to: the search's bias and its floor. */
  trip: Trip;
  /** The local half of the list — see the note above. */
  whereEntries: PickerEntry[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string | undefined;
}) {
  // The keystroke is this component's, because a live list is the one
  // caller that needs it: it is the query, not a filter over rows that
  // already hold the answer.
  const [search, setSearch] = useState("");
  const [sessionToken] = usePlaceSessionToken();
  const { data: suggestions, isFetching, isError } = usePlaceSuggestions(
    search,
    sessionToken,
    biasForTrip(trip),
    countryForTrip(trip),
  );

  return (
    <Dropdown
      label={label}
      options={travelWhereRows({
        local: whereEntries,
        suggestions,
        query: search,
        isFetching,
        isError,
      })}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      error={error}
      // Typing is itself an answer: a hotel, a friend's street and a
      // small airfield are all legitimate wheres that Places may not
      // know, and none of them should need a lookup to be filed.
      freeText
      // The rows are already ranked, and the typed row is already among
      // them, so the local substring filter must not run: it would hide
      // the live row whose label does not contain the raw keystrokes —
      // which is the row you are looking at, since Places renames a
      // result as you narrow the query.
      liveOptions
      attribution
      // Every keystroke, for the query. It commits nothing: a pick
      // commits, and on a `freeText` field so does typing.
      onSearchText={setSearch}
    />
  );
}
