/**
 * Colour maths: pure, dependency-free, no React and no renderer.
 *
 * Two measurements, because they answer two different questions.
 *
 * `contrast()` is WCAG's ratio, which answers "can this be read". It is
 * a lightness measurement, and it is the right test for text.
 *
 * `chroma()` is OKLCh's C, which answers "how loud is this". That is the
 * question the palette actually needed and WCAG could not answer: a
 * near-black and a highlighter can share a contrast ratio against a pale
 * ground while looking nothing alike. `acid #cbfb6a` clears ink at
 * 17.55:1 — it passes every contrast test there is — and its chroma is
 * 0.179, which is the loudest in this palette. Read the other way round,
 * *acid on sand* scores 1.00:1, because the two are the same lightness.
 * Which way a ratio runs matters — the audit's column is ink on the
 * tone, not the tone on the ground — and that pair is the trap this file
 * exists to avoid.
 *
 * `dE()` is OKLab's Euclidian distance over lightness, chroma *and* hue,
 * used for "are these two grounds distinguishable as two grounds".
 *
 * One convention to keep: **`dE` is reported ×100**. OKLab distances are
 * conventionally 0–1, so this palette's "13.0" is 0.130 in the papers.
 * Everything in `lib/palette.ts`, the design plan and the lab quotes the
 * ×100 form; do not mix the two in one assertion.
 */

/** A colour's sRGB channels, 0–255. */
type Rgb = { r: number; g: number; b: number };

/** OKLab: perceptual lightness, then the two opponent axes. */
export type Oklab = { L: number; a: number; b: number };

function parseHex(hex: string): Rgb {
  const h = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`not a 6-digit hex colour: ${hex}`);
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function hexToRgb(hex: string): Rgb {
  return parseHex(hex);
}

/** sRGB → linear-light, the transfer function WCAG and OKLab both need. */
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearRgb(hex: string): [number, number, number] {
  const { r, g, b } = parseHex(hex);
  return [toLinear(r), toLinear(g), toLinear(b)];
}

/**
 * WCAG 2.1 relative luminance, 0–1.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = linearRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.1 contrast ratio, 1–21, order-independent. 4.5 is the floor for
 * body text, 3.0 for large text and for a meaningful UI boundary.
 */
export function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * sRGB → OKLab, Björn Ottosson's matrices, via the LMS cone response.
 */
export function oklab(hex: string): Oklab {
  const [r, g, b] = linearRgb(hex);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/**
 * OKLCh's C: how saturated the colour is at its own lightness. 0 is a
 * grey of that lightness. In this palette, `< 0.09` is a ground, `>= 0.10`
 * is a mark, and the `-deep` text tier tops out at 0.26.
 */
export function chroma(hex: string): number {
  const { a, b } = oklab(hex);
  return Math.sqrt(a * a + b * b);
}

/**
 * OKLab distance over lightness, chroma and hue — so two colours that
 * differ only in hue still register as different, which a contrast ratio
 * cannot see. Reported ×100 (see the file header).
 */
export function dE(hexA: string, hexB: string): number {
  const x = oklab(hexA);
  const y = oklab(hexB);
  return (
    Math.sqrt((x.L - y.L) ** 2 + (x.a - y.a) ** 2 + (x.b - y.b) ** 2) * 100
  );
}
