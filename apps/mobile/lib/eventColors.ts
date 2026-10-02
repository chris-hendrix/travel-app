import type { EventType } from "@/lib/itinerary";

/**
 * Where chroma lives. High saturation, small area, no loudness cost.
 *
 * The palette's rule table calls this tier `mark`: `chroma >= 0.10`, a fill,
 * never a ground. `lib/palette.ts` holds the tokens and their measured
 * chroma; this file holds the *assignment* — which kind of thing wears which
 * one — and nothing here invents a colour.
 *
 * **Nine types, four hues.** The palette ships five pop fills (`seafoam`,
 * `watermelon`, `strawberry`, `ocean`, `acid`) and two of them already mean a
 * state elsewhere: `strawberry` is `live` on an account and `watermelon` is
 * `club` on a trip card. That leaves four, so the table groups types rather
 * than giving each its own — and the grouping is the honest part of this
 * decision, because a hue that repeats is not classifying anything.
 *
 * **What makes that acceptable is the label.** A `Badge` carries the type's
 * own name, so the hue reinforces and the word classifies; a repeated hue is
 * a family, not a collision. If the hue were ever the only carrier, this
 * table would be wrong and the palette would need five more mark tokens.
 */
export type PopHue = "ocean" | "watermelon" | "acid" | "seafoam";

/**
 * The fill for each hue, written as **literals**.
 *
 * Not `"bg-" + hue`: NativeWind compiles the class names it can *see* in the
 * source, so a computed one resolves on the web export and silently paints
 * nothing on Android — the same reason `lib/theme.ts` exists for colours that
 * a prop has to carry.
 */
export const POP_FILL: Record<PopHue, string> = {
  ocean: "bg-ocean",
  watermelon: "bg-watermelon",
  acid: "bg-acid",
  seafoam: "bg-seafoam",
};

/**
 * One hue per event type, grouped in pairs that share a subject.
 *
 * `null` is the neutral classifier — ink, which is what every category wore
 * before this file existed. `misc` keeps it on purpose: a type that means
 * "none of the above" is the one chip that should not be saying something
 * with its colour.
 *
 * The pairs, and why they pair:
 *
 *   ocean       travel, lodging      — where you are and how you got there
 *   watermelon  food_and_drink, nightlife — eating and drinking
 *   acid        arts_and_entertainment, shopping — going out to see or to buy
 *   seafoam     outdoors, wellness   — outside, and the body
 *
 * `Record<EventType, …>` rather than a partial map: it is total, so a new
 * `EventType` fails to compile here until somebody decides what it wears.
 * The test writes the API's nine out by hand as well, so a rename on the
 * server fails a test rather than rendering a chip with no fill.
 */
export const EVENT_HUES: Record<EventType, PopHue | null> = {
  travel: "ocean",
  lodging: "ocean",
  food_and_drink: "watermelon",
  nightlife: "watermelon",
  arts_and_entertainment: "acid",
  shopping: "acid",
  outdoors: "seafoam",
  wellness: "seafoam",
  misc: null,
};

/**
 * The hues an initials block may take, in the order the hash walks them.
 *
 * Deliberately the same four as the event table: the pop tier is a tier, and
 * a fifth hue for avatars would make the badges a subset of something larger
 * rather than the whole of it.
 */
export const INITIALS_HUES: PopHue[] = [
  "ocean",
  "watermelon",
  "acid",
  "seafoam",
];

/**
 * The hue a name wears, and the same one every time.
 *
 * A person's initials block is theirs, so the colour has to be a pure
 * function of the name: stable across sessions, across devices, and with
 * nothing stored. It is not a hash for security — collisions are fine and
 * expected — so a multiply-and-add over code points is the whole of it.
 *
 * Total by construction, which is the part that matters: an empty string, a
 * name in a script with no Latin letters, and a string of emoji all land on
 * a hue rather than on `undefined`. `hash % length` cannot return a
 * fractional index, and `INITIALS_HUES` is never empty.
 */
export function initialsHue(name: string): PopHue {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return INITIALS_HUES[hash % INITIALS_HUES.length]!;
}
