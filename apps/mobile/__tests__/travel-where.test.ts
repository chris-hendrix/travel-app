/**
 * `Where` suggests from strings we already hold (D6): this trip's own
 * wheres, then the trip's destination, then the caller's locations from
 * other trips — ranked, deduped and labelled here, so the field stays a
 * thin shell over a pure rule (the `travel-days.test.ts` precedent).
 *
 * The ranking takes **no query**. The component that owns the keystroke
 * is `Dropdown`, which already filters a local list by its own query,
 * and the only way to hand the keystroke up here is `onSearchText` — the
 * live-search shape the sibling source guard exists to keep out of the
 * travel files. The typed row is no exception: `withTypedRow`
 * (`lib/dropdown.ts`) offers your words as the list's **first** row,
 * built inside the component from the trimmed query, after the filter —
 * so no keystroke crosses into this file and the ranking stays a pure
 * function of the strings we hold. So the ranking ranks, and the field
 * filters and offers: every row these tests assert is a row a person can
 * see by pressing `Where`, and the one row they cannot assert — the
 * typed row, which no entry holds — is `dropdown-typed-row.test.ts`'s.
 */

import { describe, expect, it } from "vitest";
import {
  DESTINATION_PROVENANCE,
  OTHER_TRIPS_PROVENANCE,
  travelWhere,
} from "@/lib/travelWhere";

/** The columns the ranking reads, and nothing else. */
function row(
  travelType: "arrival" | "departure",
  arrivalLocation: string | null,
  departureLocation: string | null,
) {
  return { travelType, arrivalLocation, departureLocation };
}

describe("travelWhere", () => {
  it("leads with this trip's own wheres, both ends of a leg", () => {
    const rows = travelWhere(
      [
        row("arrival", "LHR T5", "JFK T4"),
        row("departure", "CDG T2", "BCN T1"),
      ],
      { location: "Barcelona, Spain" },
      [],
    );

    // The record's own end first, then the counterpart the lookup filled
    // in: a leg holds both ends, and both are wheres someone might type
    // again. A departure's own end is where it leaves from.
    expect(rows.map((entry) => entry.value)).toEqual([
      "LHR T5",
      "JFK T4",
      "BCN T1",
      "CDG T2",
      "Barcelona, Spain",
    ]);
  });

  it("dedupes case-insensitively, keeping the first spelling", () => {
    const rows = travelWhere(
      [
        row("arrival", "BCN T2", null),
        row("departure", "bcn t2", null),
        row("arrival", "  BCN T2  ", null),
      ],
      null,
      ["Bcn T2"],
    );

    expect(rows.map((entry) => entry.value)).toEqual(["BCN T2"]);
  });

  it("skips blanks rather than offering an empty row", () => {
    const rows = travelWhere(
      [row("arrival", "   ", null), row("departure", null, null)],
      { location: "  " },
      ["", "   "],
    );

    expect(rows).toEqual([]);
  });

  it("labels the trip's destination and the cross-trip wheres, and nothing else", () => {
    const rows = travelWhere(
      [row("arrival", "LHR T5", null)],
      { location: "Mallorca, Spain" },
      ["BCN T2"],
    );

    // A row's own where says everything the string does; the destination
    // and the other-trip values are the two places a reader could not
    // tell where a value came from.
    expect(rows).toEqual([
      { value: "LHR T5", label: "LHR T5" },
      {
        value: "Mallorca, Spain",
        label: "Mallorca, Spain",
        secondary: DESTINATION_PROVENANCE,
      },
      {
        value: "BCN T2",
        label: "BCN T2",
        secondary: OTHER_TRIPS_PROVENANCE,
      },
    ]);
  });

  it("keeps the other trips' own order, after this trip's rows", () => {
    const rows = travelWhere(
      [row("arrival", "LHR T5", null)],
      { location: "Mallorca, Spain" },
      ["BCN T2", "AMS Schiphol", "JFK T4"],
    );

    expect(rows.slice(1).map((entry) => entry.value)).toEqual([
      "Mallorca, Spain",
      "BCN T2",
      "AMS Schiphol",
      "JFK T4",
    ]);
  });

  it("takes an absent trip and an absent list of other trips", () => {
    expect(travelWhere([], undefined, [])).toEqual([]);
    expect(travelWhere([], null, [])).toEqual([]);
  });

  it("never returns a row a person could not commit: every value is a non-blank trimmed location", () => {
    const rows = travelWhere(
      [row("arrival", "  LHR T5  ", null)],
      { location: "Mallorca, Spain" },
      ["BCN T2"],
    );

    for (const entry of rows) {
      expect(entry.value).toBe(entry.value.trim());
      expect(entry.value).not.toBe("");
      expect(entry.label).toBe(entry.value);
    }
  });
});
