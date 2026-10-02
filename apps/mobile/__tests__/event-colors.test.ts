import { describe, expect, it } from "vitest";

import { chroma } from "@/lib/color";
import { BAND_CHROMA_MAX, BAND_TONES, TOKENS } from "@/lib/palette";
import {
  EVENT_HUES,
  INITIALS_HUES,
  POP_FILL,
  initialsHue,
  type PopHue,
} from "@/lib/eventColors";
import type { EventType } from "@/lib/itinerary";

/**
 * The API's event_type, written out here as the contract it is.
 *
 * The same shape `itinerary.test.ts` uses for `EVENT_TYPE_LABEL`: the type is
 * compile-time only, so a test that wants to be exhaustive has to name the
 * members. A rename on the server then fails a test instead of rendering a
 * chip with no fill.
 */
const API_TYPES: EventType[] = [
  "travel",
  "food_and_drink",
  "arts_and_entertainment",
  "outdoors",
  "nightlife",
  "wellness",
  "shopping",
  "lodging",
  "misc",
];

const hexOf = (name: string) =>
  TOKENS.find((t) => t.name === name)?.hex ??
  (() => {
    throw new Error(`no token named ${name}`);
  })();

describe("EVENT_HUES", () => {
  it("names every type the API can return, and nothing else", () => {
    expect(Object.keys(EVENT_HUES).sort()).toEqual([...API_TYPES].sort());
  });

  it("puts every hue in the pop tier", () => {
    // `chroma >= 0.10` is the palette's `mark` bar. A hue under it is a
    // ground wearing a chip's job, which is the one thing a pop may not be.
    const quiet = Object.entries(EVENT_HUES)
      .filter(([, hue]) => hue !== null)
      .map(([type, hue]) => `${type}: ${hue} ${chroma(hexOf(hue!)).toFixed(3)}`)
      .filter((line) => Number(line.split(" ").pop()) < 0.1);
    expect(quiet).toEqual([]);
  });

  it("never borrows a band tone", () => {
    // A band is a ground. A pop that is also a ground is a chip you cannot
    // see the edge of, and `bpink` was dropped from the band set for being
    // 6.5 dE from `lilac` — close enough that the two would be confused.
    const borrowed = Object.values(EVENT_HUES)
      .filter((hue): hue is PopHue => hue !== null)
      .filter((hue) => BAND_TONES.includes(hue));
    expect(borrowed).toEqual([]);
  });

  it("keeps every hue clear of the band bar, not just above the mark bar", () => {
    for (const hue of new Set(Object.values(EVENT_HUES))) {
      if (hue === null) continue;
      expect(chroma(hexOf(hue))).toBeGreaterThan(BAND_CHROMA_MAX);
    }
  });

  it("has a fill for every hue it names, as a literal class", () => {
    for (const hue of Object.values(EVENT_HUES)) {
      if (hue === null) continue;
      // Literal, not computed: `"bg-" + hue` resolves on web and paints
      // nothing on Android, because NativeWind only compiles the class names
      // it can see in the source.
      expect(POP_FILL[hue]).toBe(`bg-${hue}`);
    }
    expect(Object.keys(POP_FILL).sort()).toEqual(
      [...new Set(Object.values(EVENT_HUES).filter(Boolean))].sort(),
    );
  });

  it("leaves `misc` on the neutral classifier", () => {
    // "None of the above" is the one chip that should not be saying
    // something with its colour.
    expect(EVENT_HUES.misc).toBeNull();
  });

  it("gives the two types of a pair the same hue", () => {
    // The grouping is the decision this table makes, so it is asserted
    // rather than left to whoever edits it next.
    expect(EVENT_HUES.travel).toBe(EVENT_HUES.lodging);
    expect(EVENT_HUES.food_and_drink).toBe(EVENT_HUES.nightlife);
    expect(EVENT_HUES.arts_and_entertainment).toBe(EVENT_HUES.shopping);
    expect(EVENT_HUES.outdoors).toBe(EVENT_HUES.wellness);
  });
});

describe("initialsHue", () => {
  it("returns the same hue for the same name, always", () => {
    for (const name of ["Ada Lovelace", "Grace Hopper", "Alan Turing", ""]) {
      const first = initialsHue(name);
      expect(initialsHue(name)).toBe(first);
      expect(initialsHue(name)).toBe(first);
    }
  });

  it("is total over anything a name can be", () => {
    // Empty, whitespace, non-Latin, astral-plane, emoji, a lone combining
    // mark: every one of them lands on a hue rather than on `undefined`.
    const awkward = [
      "",
      " ",
      "\n",
      "\u0301",
      "李雷",
      "Мария",
      "محمد",
      "🧑‍🚀",
      "\u{1F600}\u{1F601}",
      "a".repeat(500),
    ];
    for (const name of awkward) {
      expect(INITIALS_HUES).toContain(initialsHue(name));
    }
  });

  it("only ever returns a hue the pop tier allows", () => {
    for (let i = 0; i < 500; i++) {
      const hue = initialsHue(`person ${i}`);
      expect(INITIALS_HUES).toContain(hue);
      expect(chroma(hexOf(hue))).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("spreads names across the hues rather than piling them on one", () => {
    // Not a distribution claim — a collision is fine and expected — but a
    // hash that returned one hue for every name would still pass the tests
    // above, and would make every avatar in a list the same colour.
    const seen = new Set(
      Array.from({ length: 200 }, (_, i) => initialsHue(`person ${i}`)),
    );
    expect(seen.size).toBe(INITIALS_HUES.length);
  });
});
