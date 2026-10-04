/**
 * The perforation this system draws on an edge, as data.
 *
 * Two edges wear it: the chrome band's bottom, where ink hangs in scallops
 * over the screen, and the boot cover's bottom, where the same ink rises in
 * scallops from the edge. They are **one shape turned around**, and this
 * module is where that is true rather than claimed: there is a single path
 * here, and a direction that decides which way the tile is turned. A second,
 * mirrored copy of the curve is the thing this file exists to avoid.
 *
 * Separate from the component for the reason `ruledBlockClasses.ts` and
 * `bandClasses.ts` give: `apps/mobile/vitest.config.ts` is plain node with no
 * renderer, so a *value* import of anything that reaches `react-native` pulls
 * in Flow source vitest cannot parse. The geometry is exactly the thing that
 * must not drift, so it lives where a test can reach it — the fifth constant
 * table in this system, and for the fifth time the same reason.
 */

/**
 * One tooth: the width the tile repeats at.
 *
 * Fixed rather than proportional, because the alternative is a wave whose
 * period stretches with the viewport: five teeth on a phone and twenty on a
 * desktop reads as two different edges.
 */
export const SCALLOP_PERIOD = 28;

/**
 * How deep the strip is drawn, in real pixels, on both platforms.
 *
 * Real pixels and never `h-2.5`: the two are the same 10px in a browser and
 * **not** on a phone, because `h-2.5` is `0.625rem` and NativeWind's `rem` is
 * 14 on native against 16 on web (A18) — 8.75px there, which leaves a seam of
 * ground between the ink and its own wave. It is also the band's own bottom
 * padding, which is what makes the header exactly as tall as it looks.
 */
export const SCALLOP_DEPTH = 10;

/**
 * The tile, one pixel taller than the strip that shows.
 *
 * The tile's **solid row is ink in every column**, and Android's device
 * densities are fractional (2.75x, 3.5x), so a 10px svg can land on a
 * fractional number of device pixels and render a sliver of the *next* tile.
 * That sliver is solid ink across the full width, and it shows as a hairline
 * along the outer edge: the one place the pattern must not repeat is the one
 * place it did.
 *
 * So the tile carries one row of slack the curve never draws in. The visible
 * strip is `SCALLOP_DEPTH`; the eleventh pixel is transparent, and an
 * overshoot of any fraction lands there instead of on ink. The curve itself is
 * unchanged — same period, same depth, same shape.
 *
 * Slack only helps on the **outer** edge, which is why `scallopTransform`
 * turns the whole tile rather than the drawn strip: the slack row has to
 * travel with the ink to stay behind it.
 */
export const SCALLOP_TILE = SCALLOP_DEPTH + 1;

/**
 * The one curve.
 *
 * `M0 0 H28` is the solid row — the tile's outer edge — and it is also what
 * joins the wave to the ink band above it, which is why the band and its wave
 * are one shape rather than two boxes meeting at a line.
 *
 * The two quadratics are the tooth, and they are not a sine: the boundary
 * falls to about `y=10` at `x=21` and rises to about `y=3` at `x=7`, so the
 * edge reads as a row of one-sided rounded scallops, deeper on one side of the
 * tooth than the other. `y` reaches 14 in a control point and is clipped by the
 * tile, so the drawn extent is 0..10 inside an 11px tile: the extra row is the
 * slack described above.
 *
 * One path, both directions. `__tests__/scallop.test.ts` reads the period back
 * out of this string and holds it to `SCALLOP_PERIOD`, so the curve and the
 * tile cannot disagree about how wide a tooth is.
 */
export const SCALLOP_PATH = "M0 0 H28 V6 Q21 14 14 6 Q7 0 0 6 Z";

/**
 * Which way the ink points.
 *
 * `down` is the band's bottom edge: the tile as drawn, solid row on top,
 * scallops hanging into the screen.
 *
 * `up` is a page's bottom edge: the same tile turned a half turn about its
 * **own centre**, which puts the solid row at the bottom and carries the slack
 * row to the top. The outer edge in both cases — which is the whole reason the
 * turn is about the tile's centre and not about the drawn strip's edge. A flip
 * about the strip's edge would leave the slack at the wrong end, and a
 * fractional density would then be free to paint the next tile's solid row as
 * a hairline of ink *inside* the page, which is the single artefact the slack
 * exists to prevent.
 */
export type ScallopDirection = "down" | "up";

/**
 * The pattern's `id`, one per direction.
 *
 * Per direction rather than per instance, because a screen can wear both at
 * once (a cover's footer under a band's edge) and two `<Pattern>` elements
 * sharing an `id` is a collision: the web export resolves a `url(#…)` to the
 * first match in the document. Two edges of the *same* direction would share
 * one definition, which is harmless — the definition is identical, because
 * there is nothing instance-specific in it.
 */
export function scallopPatternId(direction: ScallopDirection): string {
  return `scallop-${direction}`;
}

/**
 * The tile's turn, or `undefined` for the tile as drawn.
 *
 * The numbers are computed from the constants rather than written as a
 * literal, and that is the point: `rotate(180 14 5.5)` is only a half turn
 * about the tile's centre while the period is 28 and the tile is 11. A stale
 * literal left behind by a change to either would turn the tile about some
 * other point, the tile would no longer meet itself at the seam, and nothing
 * would fail. `__tests__/scallop.test.ts` parses this string back and asserts
 * the centre it names is the tile's own.
 */
export function scallopTransform(
  direction: ScallopDirection,
): string | undefined {
  if (direction === "down") return undefined;
  return `rotate(180 ${SCALLOP_PERIOD / 2} ${SCALLOP_TILE / 2})`;
}
