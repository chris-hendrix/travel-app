/**
 * Regenerate the app icons from the brand artwork.
 *
 * The mark has one source: `apps/web/src/app/icon.svg` (the J, its inner
 * contour line, and the brown extrusion shadow as separate paths). This
 * script derives every PNG the mobile app ships from it, so the two apps
 * cannot drift and no icon here is hand-drawn.
 *
 *   pnpm --filter @journiful/mobile gen:icons
 *
 * The tile colour is the web app's own icon ground — `#1a1814`, the same
 * value `apps/web/src/app/apple-icon.tsx` paints — sampled rather than
 * invented, so the launcher icon and the browser icon are one mark.
 *
 * Sizes and shapes follow the platforms' rules rather than taste:
 *   - launcher / PWA / favicon: the mark on the tile, mark ~62% of the canvas
 *   - maskable: mark ~50%, inside the 80% safe circle a launcher may crop to
 *   - adaptive foreground: transparent, mark ~60%, inside Android's 66% safe zone
 *   - notification: a white silhouette on transparency, which is the only
 *     form Android renders (a coloured icon becomes a grey blob)
 *   - splash: the tile as a rounded square on transparency, because the
 *     splash background is the sand ground and a cream J on sand is invisible
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.resolve(here, "..");
const repoRoot = path.resolve(mobileDir, "../..");
const sourceSvg = path.join(repoRoot, "apps/web/src/app/icon.svg");

const TILE = "#1a1814";
const SVG_VIEWBOX = "0 -11 86 97.4";

/** Proportions taken from the shipped web icons, so the two apps match. */
const MARK = {
  /** `apps/web/public/icons/icon-512x512.png` measures 67%. */
  tile: 0.67,
  /** The web's maskable icon insets the mark to 53%, inside the crop circle. */
  maskable: 0.53,
  /**
   * Android guarantees only the central ~66% circle of an adaptive icon, and
   * the mark's lowest-left point is the extrusion shadow, not the letter, so
   * the whole mark has to fit — a taller fraction clips the shadow's tip.
   */
  adaptive: 0.55,
  /** Notifications are drawn at 24dp; the glyph should fill the box. */
  notification: 0.78,
};

const source = await readFile(sourceSvg, "utf8");
const inner = source
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>[\s\S]*$/, "")
  .trim();

/** The mark at an explicit size — sharp ignores the SVG's own width/height. */
function markSvg(width, height, content = inner) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${SVG_VIEWBOX}">${content}</svg>`,
  );
}

/**
 * The mark at a given height, trimmed to its own ink.
 *
 * The trim is what makes the fractions below mean what they say: the viewBox
 * carries slack (it starts at -11 and the letter does not fill it), so an
 * untrimmed render sits low and left of centre and comes out smaller than
 * requested. Trimming first means `height` is the mark's actual height and the
 * composite below centres the ink rather than the box around it.
 */
async function mark(height, content = inner) {
  const oversize = Math.max(1024, height * 2);
  const raw = await sharp(markSvg(oversize, Math.round(oversize * 1.15), content))
    .png()
    .toBuffer();
  return sharp(raw).trim({ threshold: 1 }).resize({ height }).png().toBuffer();
}

/** The mark centred on the brand tile. */
async function onTile(size, markHeight, { radius = 0 } = {}) {
  const base = sharp({
    create: { width: size, height: size, channels: 4, background: TILE },
  }).png();
  const tile = radius
    ? await sharp(await base.toBuffer())
        .composite([
          {
            input: Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
            ),
            blend: "dest-in",
          },
        ])
        .png()
        .toBuffer()
    : await base.toBuffer();

  const art = await mark(markHeight);
  return sharp(tile)
    .composite([{ input: art, gravity: "centre" }])
    .png()
    .toBuffer();
}

/** The mark alone on transparency. */
async function onNothing(size, markHeight, content = inner) {
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: await mark(markHeight, content), gravity: "centre" }])
    .png()
    .toBuffer();
}

/**
 * The letter alone in white. Android draws a notification small icon from
 * its alpha channel, so the shadow and the cream face would both come out
 * opaque: the silhouette has to be the letter form and nothing else.
 */
const letterOnly = inner
  .split(/(?=<path)/)
  .find((part) => part.includes('fill="#f5edd6"'))
  ?.replace('stroke="#2c2217" stroke-width="1.5" stroke-linecap="round"', "")
  .replace('fill="#f5edd6"', 'fill="#ffffff"');

if (!letterOnly) throw new Error("the letter path moved in icon.svg");

const outputs = [
  // Android launcher + Expo's own app icon.
  ["assets/icon.png", await onTile(1024, Math.round(1024 * MARK.tile))],
  // Transparent foreground: the launcher masks it and paints
  // app.json's adaptiveIcon.backgroundColor behind it.
  ["assets/adaptive-icon.png", await onNothing(1024, Math.round(1024 * MARK.adaptive))],
  // The splash ground is sand, so the tile travels with the mark.
  ["assets/splash.png", await onTile(1024, Math.round(1024 * MARK.adaptive), { radius: 200 })],
  // White silhouette for the status bar, on a square canvas: a non-square
  // drawable gets scaled by whatever the notification shade decides.
  ["assets/notification-icon.png", await onNothing(96, Math.round(96 * MARK.notification), letterOnly)],
  // Browser tab.
  ["assets/favicon.png", await onTile(512, Math.round(512 * MARK.tile))],
  // PWA / manifest icons.
  ["public/icons/icon-192.png", await onTile(192, Math.round(192 * MARK.tile))],
  ["public/icons/icon-512.png", await onTile(512, Math.round(512 * MARK.tile))],
  // Maskable: the launcher may crop to a circle, so the mark sits inside it.
  ["public/icons/maskable-512.png", await onTile(512, Math.round(512 * MARK.maskable))],
];

await mkdir(path.join(mobileDir, "public/icons"), { recursive: true });
for (const [rel, buffer] of outputs) {
  await writeFile(path.join(mobileDir, rel), buffer);
  const { width, height } = await sharp(buffer).metadata();
  console.log(`${rel.padEnd(34)} ${width}x${height}  ${buffer.length} bytes`);
}
console.log(`\nAll derived from ${path.relative(repoRoot, sourceSvg)}`);
