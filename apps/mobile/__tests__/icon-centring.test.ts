import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

/**
 * The launcher, PWA and splash icons carry the letter centred, and the
 * shadow is allowed to hang into the padding rather than to hold the letter
 * off-centre. `scripts/generate-icons.mjs` produces them by trimming the
 * mark to its ink and compositing the result; the ink of the mark is the
 * letter *plus* its extrusion shadow, and the shadow sits left and below,
 * so centring the ink used to leave the J 26px right and 22px up on a 512
 * tile — a fifth of the mark's width, and the first thing the eye catches.
 *
 * The letter's face is the only cream in these files, which is what makes
 * the check possible without a reference: find it, and compare its centre
 * to the canvas centre. The bound is 1%, which passes the correction
 * comfortably and fails the un-corrected artwork loudly.
 */
const mobileDir = path.resolve(__dirname, "..");

const isFace = (r: number, g: number, b: number, a: number) =>
  a > 200 && r > 200 && g > 190 && b > 160 && b < 235;

async function faceCentre(rel: string) {
  const { data, info } = await sharp(path.join(mobileDir, rel))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (
        isFace(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0)
      ) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error(`no letter face found in ${rel} — did the palette change?`);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, width, height };
}

describe("icons: the letter is centred on the tile", () => {
  const files = [
    "assets/icon.png",
    "assets/adaptive-icon.png",
    "assets/splash.png",
    "assets/favicon.png",
    "public/icons/icon-192.png",
    "public/icons/icon-512.png",
    "public/icons/maskable-512.png",
  ];

  it.each(files)("%s", async (rel) => {
    const { cx, cy, width, height } = await faceCentre(rel);
    expect(fs.existsSync(path.join(mobileDir, rel)), `${rel} exists`).toBe(true);
    expect(Math.abs(cx - width / 2)).toBeLessThanOrEqual(width * 0.01);
    expect(Math.abs(cy - height / 2)).toBeLessThanOrEqual(height * 0.01);
  });
});
