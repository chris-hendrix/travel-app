/**
 * `Where` suggests from live Places **and** from strings we already hold:
 * this trip's own wheres, then the trip's destination, then the caller's
 * locations from other trips — ranked, deduped and labelled here, so the
 * field stays a thin shell over a pure rule (the `travel-days.test.ts`
 * precedent).
 *
 * `travelWhere` is the local half; `travelWhereRows` puts Google's live
 * answers in front of it and pins the typed row after them. Both are pure
 * functions of what they were handed: the query arrives as one argument
 * rather than as a keystroke the file has to hold, which is what keeps
 * the ranking testable without a renderer.
 *
 * The rows these tests assert are the rows a person sees. What they do
 * **not** assert is that a live row commits a place's words rather than
 * its id — that is `placePickerRows`' own option, spec'd in
 * `place-options.test.ts`, and asserted for travel by the source guard in
 * `travel-place-metadata.test.ts`.
 */

import { describe, expect, it } from "vitest";
import {
  DESTINATION_PROVENANCE,
  OTHER_TRIPS_PROVENANCE,
  travelWhere,
  travelWhereRows,
} from "@/lib/travelWhere";
import type { PlaceSuggestion } from "@/lib/queries/places";

/**
 * One live Google result.
 *
 * `shortName` is deliberately never equal to `name` here: the field
 * commits the short reading, and a helper that made them the same string
 * would let a regression to the full `displayName` pass every assertion
 * below. The long name is `shortName` plus a tail, the way Google's own
 * is the main text plus the address.
 */
function suggestion(
  placeId: string,
  shortName: string,
  address = "",
  name = `${shortName}, somewhere much longer`,
): PlaceSuggestion {
  return { placeId, name, shortName, address, types: [] };
}

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

/** The local half, for the merge cases below. */
function localRows() {
  return travelWhere(
    [row("arrival", "BCN T2", null)],
    { location: "Mallorca, Spain" },
    ["AMS Schiphol"],
  );
}

describe("travelWhereRows", () => {
  it("leads with Google's answers and follows with this trip's own", () => {
    const rows = travelWhereRows({
      local: localRows(),
      suggestions: [suggestion("ChIJ1", "Barcelona–El Prat (BCN)", "El Prat")],
      query: "BCN",
    });

    expect(rows.map((entry) => entry.label)).toEqual([
      "Barcelona–El Prat (BCN)",
      // `BCN T2` is this trip's own filed where and matches the query;
      // the destination and `AMS Schiphol` do not, so they are dropped.
      "BCN T2",
      '"BCN"',
    ]);
  });

  it("offers only local rows when Google has nothing", () => {
    const rows = travelWhereRows({
      local: localRows(),
      suggestions: [],
      query: "Mal",
    });

    expect(rows.map((entry) => entry.label)).toEqual([
      "Mallorca, Spain",
      '"Mal"',
    ]);
    expect(rows[0]?.secondary).toBe(DESTINATION_PROVENANCE);
  });

  it("keeps the trip's own rows when the lookup fails or has no key", () => {
    // CI is this case: no `GOOGLE_MAPS_API_KEY` means the proxy answers
    // 503, which the pickers read as failure rather than as "no such
    // place". The field must still answer with something a person can
    // commit — the local half and their own words.
    const rows = travelWhereRows({
      local: localRows(),
      suggestions: undefined,
      query: "AMS",
      isError: true,
    });

    expect(rows.map((entry) => entry.label)).toEqual([
      "Couldn't reach Google Places",
      "AMS Schiphol",
      '"AMS"',
    ]);
    expect(rows[0]?.disabled).toBe(true);
    expect(rows[rows.length - 1]).toMatchObject({
      value: "AMS",
      fieldText: "AMS",
    });
  });

  it("never draws the same string twice", () => {
    // The typed row carries the query, and a local row may carry it too:
    // one row, not two, and the typed one is preferred because it is the
    // row the press was resolved against.
    const rows = travelWhereRows({
      local: travelWhere([row("arrival", "BCN T2", null)], null, []),
      suggestions: [suggestion("ChIJ1", "BCN T2", "El Prat")],
      query: "BCN T2",
    });

    expect(rows.map((entry) => entry.label)).toEqual(["BCN T2"]);
    expect(rows).toHaveLength(1);
  });

  it("commits text, never a place id or a display name", () => {
    const rows = travelWhereRows({
      local: localRows(),
      suggestions: [
        suggestion("ChIJ1", "Barcelona–El Prat (BCN)", "El Prat"),
      ],
      query: "BCN",
    });

    // The whole point of the field: the id stops inside this function,
    // and so does Google's long reading of the place. A value that were
    // either would be saved as the leg's location and printed on the
    // board.
    for (const entry of rows) {
      expect(entry.value).not.toBe("ChIJ1");
      expect(entry.value).not.toContain("much longer");
      expect(entry.disabled).toBeUndefined();
    }
    expect(rows[0]).toMatchObject({
      value: "Barcelona–El Prat (BCN)",
      label: "Barcelona–El Prat (BCN)",
      secondary: "El Prat",
    });
  });

  it("offers nothing before the first keystroke", () => {
    // A live list closes on an empty field (`Dropdown`): there is no
    // query to answer, and the rows that would answer it are the whole
    // local list rather than a suggestion.
    expect(
      travelWhereRows({ local: localRows(), suggestions: [], query: "   " }),
    ).toEqual([]);
  });

  it("shows a Searching… row in flight without losing the local half", () => {
    const rows = travelWhereRows({
      local: localRows(),
      suggestions: undefined,
      query: "BCN",
      isFetching: true,
    });

    expect(rows.map((entry) => entry.label)).toEqual([
      "Searching…",
      "BCN T2",
      '"BCN"',
    ]);
  });
});
