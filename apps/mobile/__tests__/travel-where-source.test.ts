/**
 * The no-Places guard for the travel `Where` field (D6's condition).
 *
 * `Where` autocompletes from strings we already hold — this trip's own
 * wheres, the trip's destination, and `GET /member-travel/locations`.
 * No Google Places call, no place id, no coordinates, and therefore no
 * attribution. That is a design decision the compiler cannot state:
 * importing the Places query module would typecheck, lint and run.
 *
 * So it is asserted here, over the sources themselves, the
 * `expo-policy.test.ts` way. It passes today and fails the moment one of
 * these files grows a Places import — which is the point: the failure
 * names the file and what it named, and reads as "this is the wiring the
 * plan forbade", not as a puzzle.
 *
 * `attribution` and `onSearchText` are the live-Places shape, so they are
 * banned from the field's props for the same reason from the other side:
 * an attributed footer marks a list that legally owes Google credit, and
 * `onSearchText` hands every keystroke to a caller that fetches — while
 * the travel list is local and its `Dropdown` filters itself.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const mobileDir = path.resolve(__dirname, "..");

/** The files that render, feed or rank the travel `Where` list. */
const TRAVEL_SOURCES = [
  path.join("components", "trip", "TravelDialog.tsx"),
  path.join("app", "trips", "travel", "form.tsx"),
  path.join("lib", "travelWhere.ts"),
];

/** Named anywhere in the file, and the reason, for the failure message. */
const BANNED_TOKENS: Array<{ pattern: RegExp; what: string }> = [
  {
    pattern: /@\/lib\/queries\/places/,
    what: "the Places query module (the travel list is strings only, D6)",
  },
  {
    pattern: /\bplacePickerRows\b/,
    what: "the Places row builder (the travel list has its own ranking)",
  },
  {
    pattern: /\bMapsAttribution\b/,
    what: "the Google Maps mark (nothing on this list comes from Google)",
  },
];

/** Props only a live Places-backed field takes. */
const BANNED_DROPDOWN_PROPS: Array<{ pattern: RegExp; what: string }> = [
  {
    pattern: /\battribution\b/,
    what: "`attribution` (only a Places-backed field owes the mark)",
  },
  {
    pattern: /\bonSearchText\b/,
    what: "`onSearchText` (every keystroke would become a live query)",
  },
];

/** Every `<Dropdown … />` element in a source, self-closing or not. */
function dropdownElements(source: string): string[] {
  return source.match(/<Dropdown\b[\s\S]*?(?:\/>|>\s*\n)/g) ?? [];
}

describe("the travel Where list never touches Places", () => {
  it("guards files that exist, so a rename cannot silently retire the guard", () => {
    // A guard over a moved file passes vacuously: a source list that was
    // trimmed instead of moved would keep this suite green while the real
    // `Where` field went unguarded.
    for (const rel of TRAVEL_SOURCES) {
      expect(
        fs.existsSync(path.join(mobileDir, rel)),
        `${rel} is missing`,
      ).toBe(true);
    }
  });

  for (const rel of TRAVEL_SOURCES) {
    const source = fs.readFileSync(path.join(mobileDir, rel), "utf8");

    it(`${rel} carries no Places import`, () => {
      for (const { pattern, what } of BANNED_TOKENS) {
        expect(pattern.test(source), `${rel} names ${what}`).toBe(false);
      }
    });

    it(`${rel} gives Dropdown no live-Places prop`, () => {
      const elements = dropdownElements(source);
      // `TravelDialog` renders Dropdowns; `travelWhere` renders none and
      // `form.tsx` owns the screen. An empty list is a pass, and a file
      // that gains a Dropdown starts being checked by the same loop.
      for (const element of elements) {
        for (const { pattern, what } of BANNED_DROPDOWN_PROPS) {
          expect(pattern.test(element), `${rel} passes ${what}`).toBe(false);
        }
      }
    });
  }
});
