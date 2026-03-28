#!/usr/bin/env node
/**
 * Generate PWA raster icons from the SVG source icon.
 * Uses sharp (already a project dependency).
 *
 * Usage: node apps/web/scripts/generate-pwa-icons.mjs
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcSvg = join(__dirname, "..", "src", "app", "icon.svg");
const outDir = join(__dirname, "..", "public", "icons");

const BG = "#1a1814";

/** Standard icons — render SVG centered on dark background */
const standard = [
  { name: "icon-192x192.png", size: 192, padding: 24 },
  { name: "icon-512x512.png", size: 512, padding: 64 },
  { name: "apple-touch-icon.png", size: 180, padding: 22 },
  { name: "badge-72x72.png", size: 72, padding: 12 },
];

/** Maskable icons — safe zone is the inner 80%, so use more padding */
const maskable = [
  { name: "icon-maskable-192x192.png", size: 192, padding: 38 },
  { name: "icon-maskable-512x512.png", size: 512, padding: 102 },
];

await mkdir(outDir, { recursive: true });

for (const { name, size, padding } of [...standard, ...maskable]) {
  const innerSize = size - padding * 2;

  const svgResized = await sharp(srcSvg)
    .resize(innerSize, innerSize, { fit: "contain", background: "transparent" })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: svgResized, left: padding, top: padding }])
    .png()
    .toFile(join(outDir, name));

  console.log(`  ✓ ${name} (${size}x${size})`);
}

console.log(`\nDone — ${standard.length + maskable.length} icons in ${outDir}`);
