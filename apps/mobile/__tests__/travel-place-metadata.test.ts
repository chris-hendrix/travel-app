/**
 * The guard for what the travel `Where` field may keep (D6, revised).
 *
 * `Where` shows live Google Places results and keeps a place's **words**
 * and nothing else: no `placeId` on the leg, no coordinates, no snapshot,
 * no details lookup. The place id stops inside `travelWhereRows`
 * (`commit: "name"`), so what the field hands back — and therefore what
 * the store sends and the API stores — is the text a person picked, whole:
 * the name and the address under it, because a where is the one thing the
 * app knows about that end of the leg and it has to be a place somebody
 * can get to. What the text *says* is not this guard's business; that it
 * is text, and only text, is. The location columns stay `text`.
 *
 * That is a design decision the compiler cannot state. A `placeId` riding
 * along beside the text would typecheck, lint and run: the dialog would
 * pass it, the store would send it, and it would be dropped on the floor
 * by the API's schema — until someone widened the column, and then travel
 * would quietly have coordinates nothing on screen uses.
 *
 * So it is asserted here, over the sources themselves, the
 * `expo-policy.test.ts` way: the failure names the file and the token, and
 * reads as "this is the metadata the field was deliberately not given".
 *
 * The other half is the reason the field may show Google's rows at all.
 * `attribution` and `liveOptions` are asserted **present**, not absent:
 * the rows on screen are Google's, the mark under them is the condition
 * the results are drawn under, and a field that showed live rows without
 * it would be outside those terms. Neither is a style preference, which is
 * why both directions are guarded rather than reviewed.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const mobileDir = path.resolve(__dirname, "..");
const repoDir = path.resolve(mobileDir, "..", "..");

/** Everything that defines, renders or sends a travel location. */
const RECORD_SOURCES = [
  path.join(mobileDir, "lib", "newTravel.ts"),
  path.join(mobileDir, "lib", "queries", "travel.ts"),
  path.join(mobileDir, "lib", "travelStore.tsx"),
  path.join(mobileDir, "components", "trip", "TravelDialog.tsx"),
  path.join(mobileDir, "components", "trip", "TravelWhereField.tsx"),
  path.join(mobileDir, "app", "trips", "travel", "form.tsx"),
  path.join(repoDir, "shared", "schemas", "member-travel.ts"),
];

/** Named anywhere in a record source, and why it may not be. */
const PLACE_METADATA: Array<{ pattern: RegExp; what: string }> = [
  { pattern: /\bplaceId\b/, what: "a place id" },
  { pattern: /\bselectedPlaceId\b/, what: "the picked place's id" },
  { pattern: /\bplaceName\b/, what: "a place name snapshot" },
  { pattern: /\bplaceAddress\b/, what: "a place address snapshot" },
  { pattern: /\bplaceLat\b/, what: "a place latitude" },
  { pattern: /\bplaceLon\b/, what: "a place longitude" },
  { pattern: /\bcoords\b/, what: "coordinates" },
  { pattern: /\blatitude\b/, what: "a latitude" },
  { pattern: /\blongitude\b/, what: "a longitude" },
  { pattern: /\busePlaceDetails\b/, what: "the details lookup" },
];

/** The two files that build the field's rows. */
const WHERE_SOURCES = [
  path.join(mobileDir, "lib", "travelWhere.ts"),
  path.join(mobileDir, "components", "trip", "TravelWhereField.tsx"),
];

function read(absolute: string): string {
  return fs.readFileSync(absolute, "utf8");
}

/** Every `<Dropdown … />` element in a source, self-closing or not. */
function dropdownElements(source: string): string[] {
  return source.match(/<Dropdown\b[\s\S]*?(?:\/>|>\s*\n)/g) ?? [];
}

describe("travel keeps a place's text and nothing else", () => {
  it("guards files that exist, so a rename cannot silently retire the guard", () => {
    // A guard over a moved file passes vacuously: a source list that was
    // trimmed instead of moved would keep this suite green while the real
    // `Where` field went unguarded.
    for (const file of [...RECORD_SOURCES, ...WHERE_SOURCES]) {
      expect(fs.existsSync(file), `${file} is missing`).toBe(true);
    }
  });

  for (const file of RECORD_SOURCES) {
    const rel = path.relative(repoDir, file);

    it(`${rel} carries no place metadata`, () => {
      const source = read(file);
      for (const { pattern, what } of PLACE_METADATA) {
        expect(pattern.test(source), `${rel} names ${what}`).toBe(false);
      }
    });
  }

  it("the rows are asked to commit the place's own reading, not its id", () => {
    // The positive half of the rule above: nothing in a record source
    // names a place id, and this is *why* — `travelWhereRows` tells the
    // row builder to make each live row's value the place's own whole
    // reading, so the id is not in the row for a caller to reach for.
    const source = read(path.join(mobileDir, "lib", "travelWhere.ts"));
    expect(source).toMatch(/commit:\s*"name"/);
    expect(source).not.toMatch(/commit:\s*"id"/);
  });

  for (const file of WHERE_SOURCES) {
    const rel = path.relative(repoDir, file);

    it(`${rel} never asks the row builder for an id`, () => {
      const elements = dropdownElements(read(file));
      const source = read(file);
      expect(
        /commit:\s*"id"/.test(source),
        `${rel} asks for placeId rows`,
      ).toBe(false);
      // `TravelWhereField` renders the Dropdown, so its element is where
      // the two live-only props have to be. An empty list is a pass, and a
      // file that grows a Dropdown starts being checked by the same loop.
      for (const element of elements) {
        expect(
          /\battribution\b/.test(element),
          `${rel} draws Google's rows without the mark`,
        ).toBe(true);
        expect(
          /\bliveOptions\b/.test(element),
          `${rel} filters Google's rows by the raw keystrokes`,
        ).toBe(true);
      }
    });
  }
});
