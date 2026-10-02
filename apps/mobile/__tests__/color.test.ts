import { describe, expect, it } from "vitest";
import { chroma, contrast, dE, hexToRgb, oklab, relativeLuminance } from "@/lib/color";

/**
 * The maths itself, against figures this plan measured independently.
 *
 * These are the numbers the rest of the palette work is derived from, so
 * they are asserted against the plan's own published values rather than
 * against whatever this implementation happens to produce: if the two
 * disagree, the palette is wrong, not the test.
 */
describe("color: OKLCh chroma", () => {
  it("puts a neutral at zero", () => {
    expect(chroma("#000000")).toBeCloseTo(0, 6);
    expect(chroma("#ffffff")).toBeCloseTo(0, 6);
    expect(chroma("#7f7f7f")).toBeCloseTo(0, 4);
  });

  it("rates the palette's loudest token as the plan does", () => {
    // The audit's headline correction: acid passes every contrast test
    // and is still the loudest tone in the palette.
    expect(chroma("#cbfb6a")).toBeCloseTo(0.179, 3);
    expect(chroma("#42d177")).toBeCloseTo(0.176, 3);
    expect(chroma("#4281ff")).toBeCloseTo(0.199, 3);
  });

  it("rates the band tones below the calm ceiling", () => {
    expect(chroma("#E2BFE3")).toBeCloseTo(0.062, 2);
    expect(chroma("#9adee4")).toBeCloseTo(0.069, 2);
  });
});

describe("color: OKLab distance", () => {
  it("is zero for a colour against itself", () => {
    expect(dE("#f5eacc", "#f5eacc")).toBe(0);
  });

  it("separates the two grounds the audit flagged as too close", () => {
    // silver vs concrete, and gravel vs sand — the pairs that made the
    // dE 6 rule necessary in the first place.
    expect(dE("#b3b3b3", "#b0ad9b")).toBeCloseTo(3.3, 1);
    expect(dE("#e2ded5", "#f5eacc")).toBeCloseTo(4.6, 1);
  });

  it("clears the seam bar for the band tones", () => {
    expect(dE("#E2BFE3", "#f5eacc")).toBeCloseTo(13.0, 1);
    expect(dE("#9adee4", "#f5eacc")).toBeCloseTo(12.3, 1);
    // The tightest pair in the set, and the reason the bar is 6 and not
    // higher: bpink clears it by only half a point.
    expect(dE("#E2BFE3", "#ffd1ed")).toBeCloseTo(6.5, 1);
  });

  it("sees a hue difference that a contrast ratio cannot", () => {
    // Same lightness, different hue: contrast is identical, dE is not.
    const a = "#4281ff";
    const b = "#ff6352";
    expect(dE(a, b)).toBeGreaterThan(20);
  });
});

describe("color: WCAG contrast", () => {
  it("matches the plan's published ratios", () => {
    expect(contrast("#000000", "#f5eacc")).toBeCloseTo(17.52, 1);
    expect(contrast("#b8271a", "#e2ded5")).toBeCloseTo(4.7, 1);
  });

  it("does not round a token over its own floor", () => {
    // seafoam-deep prints as 4.50 and measures 4.5022. Asserting the
    // rounded figure would let a token sit at 4.4 and still pass.
    const ratio = contrast("#1c713b", "#e2ded5");
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeCloseTo(4.5022, 3);
  });

  it("is order-independent", () => {
    expect(contrast("#000000", "#f5eacc")).toBeCloseTo(
      contrast("#f5eacc", "#000000"),
      10,
    );
  });

  it("brackets the scale at 1 and 21", () => {
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 10);
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 6);
  });
});

describe("color: parsing", () => {
  it("accepts a leading hash or none", () => {
    expect(hexToRgb("#4281ff")).toEqual({ r: 0x42, g: 0x81, b: 0xff });
    expect(hexToRgb("4281ff")).toEqual({ r: 0x42, g: 0x81, b: 0xff });
  });

  it("refuses anything that is not a 6-digit hex", () => {
    // A three-digit shorthand would silently parse as something else.
    expect(() => hexToRgb("#fff")).toThrow();
    expect(() => hexToRgb("hsl(1 2% 3%)")).toThrow();
    expect(() => hexToRgb("")).toThrow();
  });

  it("reports luminance in 0..1", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
  });

  it("returns an OKLab lightness in 0..1", () => {
    expect(oklab("#000000").L).toBeCloseTo(0, 6);
    expect(oklab("#ffffff").L).toBeCloseTo(1, 6);
  });
});
