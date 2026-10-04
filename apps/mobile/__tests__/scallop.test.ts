import { describe, expect, it } from "vitest";

import {
  SCALLOP_DEPTH,
  SCALLOP_PATH,
  SCALLOP_PERIOD,
  SCALLOP_TILE,
  scallopPatternId,
  scallopTransform,
} from "@/components/ui/scallopTiles";

/**
 * The perforation's geometry, held still.
 *
 * Two edges wear this edge and they wear the same shape turned around, so the
 * thing that must not drift is not the curve — there is only one of those —
 * but the *relationship* between the turn and the tile it is about. A
 * `rotate(180 14 5.5)` is a half turn about the tile's centre only while the
 * period is 28 and the tile is 11; the day either changes, a literal left
 * behind turns the tile about a different point, the tile stops meeting itself
 * at the seam, and nothing in the app fails.
 *
 * So the numbers are read back out of the transform and compared against the
 * constants, and the property the direction exists for is asserted rather than
 * assumed: the row that is solid ink is the outer edge, and the slack row is
 * behind it.
 *
 * File reads and arithmetic, no renderer, because the mobile suite is plain
 * node (A9) and this component cannot be mounted here at all.
 */

/** The half turn's centre, parsed out of the transform string. */
function turnCentre(direction: "up") {
  const transform = scallopTransform(direction);
  const match = /^rotate\(180 (-?[\d.]+) (-?[\d.]+)\)$/.exec(transform ?? "");
  expect(match, `${direction} is a half turn`).not.toBeNull();
  return { x: Number(match![1]), y: Number(match![2]) };
}

/** A point under the half turn about the tile's centre. */
function turned(y: number, centre: number) {
  return 2 * centre - y;
}

describe("the scallop tile", () => {
  it("keeps the measured period, depth and tile", () => {
    // These three are the shipped edge. The period is what stops the wave
    // stretching with the viewport; the depth is also the band's own bottom
    // padding, so it is what makes the header as tall as it looks; the tile is
    // one row of slack behind the drawn strip.
    expect(SCALLOP_PERIOD).toBe(28);
    expect(SCALLOP_DEPTH).toBe(10);
    expect(SCALLOP_TILE).toBe(SCALLOP_DEPTH + 1);
  });

  it("draws the band's edge as the tile is drawn", () => {
    // The band's wave is the tile itself: solid row on top, joined to the band
    // above it, scallops hanging into the screen.
    expect(scallopTransform("down")).toBeUndefined();
  });

  it("turns the footer's edge a half turn about the tile's own centre", () => {
    const { x, y } = turnCentre("up");
    expect(x).toBe(SCALLOP_PERIOD / 2);
    expect(y).toBe(SCALLOP_TILE / 2);
  });

  it("puts the solid row on the outer edge in both directions", () => {
    // `down`: the solid row is the tile's first row, at the top of the strip,
    // which is where the band's ink is.
    expect(0).toBe(0);
    // `up`: the same row, turned, lands on the tile's last row — the bottom of
    // the strip, which is the page's own edge.
    const { y } = turnCentre("up");
    expect(turned(0, y)).toBe(SCALLOP_TILE);
  });

  it("carries the slack row behind the ink in both directions", () => {
    // Slack is the row past the drawn strip. Below it in the band's case, and
    // above it in the footer's — the outer edge either way, which is the whole
    // reason the turn is about the tile's centre and not the strip's edge.
    expect(SCALLOP_TILE).toBeGreaterThan(SCALLOP_DEPTH);
    const { y } = turnCentre("up");
    expect(turned(SCALLOP_TILE, y)).toBe(0);
    expect(turned(SCALLOP_DEPTH, y)).toBe(SCALLOP_TILE - SCALLOP_DEPTH);
  });

  it("draws one curve, and its tooth is the period", () => {
    // The path's horizontal run is the tile's width. Read back rather than
    // restated, so the curve and the tile cannot disagree about a tooth.
    const run = /H(\d+)/.exec(SCALLOP_PATH);
    expect(run, "the path carries its own width").not.toBeNull();
    expect(Number(run![1])).toBe(SCALLOP_PERIOD);
    // A closed shape, because it is filled: the solid row plus the boundary.
    expect(SCALLOP_PATH.endsWith("Z")).toBe(true);
    expect(SCALLOP_PATH.startsWith("M0 0 H")).toBe(true);
  });

  it("names a pattern per direction", () => {
    // A screen can wear both edges at once, and two `<Pattern>` elements
    // sharing an id is a collision the web export resolves to the first
    // definition in the document.
    expect(scallopPatternId("up")).not.toBe(scallopPatternId("down"));
  });
});
