/**
 * A band's tone, and the class that paints it.
 *
 * Separate from `Band.tsx` for the same reason `ruledBlockClasses.ts` is
 * separate from `RuledBlock.tsx`: `apps/mobile/vitest.config.ts` is plain
 * node with no renderer, and a *value* import of a component file pulls in
 * `react-native`, whose entry point is Flow source vitest cannot parse. The
 * tone list is exactly the thing that must be held against the palette, so
 * it lives where a test can reach it.
 *
 * **The literals are not the guard.** `BandTone` stops a tone that is not
 * one of these two, but it cannot stop a *third* pale tone being added —
 * every pale token passes the chroma and separation bars, which is why
 * `bpink #ffd1ed` was a legitimate candidate until A2 dropped it by
 * judgement rather than by measurement. What makes the count real is
 * `__tests__/palette.test.ts`: it asserts this map's keys are exactly
 * `lib/palette.ts`'s band rows, so adding a tone here without adding a row
 * there fails, and vice versa.
 */
export type BandTone = "lilac" | "baltic";

/**
 * The two tones, as class strings rather than hexes: a band is a ground, so
 * it is painted by the token and never by a value written here. NativeWind
 * resolves `bg-lilac` from `global.css`'s `@theme`.
 */
export const BAND_CLASSES: Record<BandTone, string> = {
  lilac: "bg-lilac",
  baltic: "bg-baltic",
};
