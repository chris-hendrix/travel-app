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
 * The letter's face is the only cream in these files — `#f5edd6`, the
 * artwork's own cream, a shade off the `--color-sand` ground (#f5eacc) —
 * which is what makes the check possible without a reference: find it, and
 * compare its centre to the canvas centre. A rebrand that moves either
 * cream has to move `isFace` with it. The bound is 1%, which passes the
 * correction comfortably and fails the un-corrected artwork loudly.
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
    // Existence first: sharp throws its own rejection on a missing file, which
    // reads as an engine error a long way from the file that moved.
    expect(fs.existsSync(path.join(mobileDir, rel)), `${rel} exists`).toBe(true);
    const { cx, cy, width, height } = await faceCentre(rel);
    expect(Math.abs(cx - width / 2)).toBeLessThanOrEqual(width * 0.01);
    expect(Math.abs(cy - height / 2)).toBeLessThanOrEqual(height * 0.01);
  });
});

describe("icons: sharp's trim offsets are read the way the script reads them", () => {
  it("reports the origin negated", async () => {
    // The script's own sign is only correct while this holds: it takes
    // `-info.trimOffsetLeft` as the ink's position on the canvas, which means
    // sharp has to report the *negation* of the trimmed region's origin. A
    // 20x10 rect placed at (40, 25) is the smallest thing that answers it —
    // measured on sharp 0.35.4 it comes back as left: -40, top: -25. A sharp
    // upgrade that reports it the other way round fails here rather than
    // leaving the letter off-centre in seven files with no explanation.
    const buf = await sharp({
      create: {
        width: 100,
        height: 60,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: {
            create: {
              width: 20,
              height: 10,
              channels: 4,
              background: { r: 255, g: 0, b: 0, alpha: 1 },
            },
          },
          left: 40,
          top: 25,
        },
      ])
      .png()
      .toBuffer();
    const { info } = await sharp(buf)
      .trim({ threshold: 1 })
      .toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(20);
    expect(info.height).toBe(10);
    expect(-(info.trimOffsetLeft ?? 0)).toBe(40);
    expect(-(info.trimOffsetTop ?? 0)).toBe(25);
  });
});
