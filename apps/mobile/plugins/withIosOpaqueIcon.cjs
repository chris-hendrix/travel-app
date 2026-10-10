/**
 * The App Store icon has to be opaque, and prebuild is what decides that.
 *
 * App Store Connect refuses a marketing icon that is transparent or merely
 * carries an alpha channel at all (ITMS-90717), so `assets/ios-icon.png` is
 * flattened at the source in `scripts/generate-icons.mjs`. That is necessary
 * and not sufficient: prebuild does not copy that file into the appiconset, it
 * re-encodes it through `@expo/image-utils`, and which branch of that library
 * runs is what decides the colour type of the file Apple reads.
 *
 *   - With a sharp instance available, `Image.resizeAsync` runs
 *     `.keepIccProfile().ensureAlpha().resize(...)` and composites a 3-channel
 *     white plate with `dest-over`; the `.flatten()` branch below that is never
 *     reached, and the pipeline still carries an alpha band when it encodes —
 *     colour type 6 (RGBA), which is the ITMS-90717 failure.
 *   - Without one, it falls back to jimp and calls `jimp.colorType(2)` (the
 *     `removeTransparency` branch) — colour type 2.
 *
 * So the built icon's opacity depends on whether the machine that ran prebuild
 * happened to have sharp where `@expo/image-utils` looks for it, which nothing
 * in this repo declares. This plugin makes it unconditional instead: after
 * prebuild has written the appiconset, the default icon is composited onto the
 * brand tile and its alpha band dropped.
 *
 * A *finalized* mod rather than a dangerous one, on purpose: dangerous mods run
 * first — that is where `withIosIcons` writes the appiconset — and finalized
 * mods run last, so this reads the file prebuild generated instead of racing
 * it. A hand-edit of `ios/` cannot be the fix for the same reason
 * `plugins/withAndroidSigning.cjs` cannot be one for gradle: `expo prebuild
 * --clean` regenerates the directory.
 *
 * Idempotent: an icon that already has no alpha band is left byte-for-byte
 * alone, so this is a no-op wherever prebuild was already right.
 */
/* eslint-disable no-undef */
// @ts-nocheck — plain Node config plugin, no types by design.
const fs = require("fs");
const path = require("path");
const { withFinalizedMod } = require("expo/config-plugins");

/** Where `withIosIcons` puts the icons, under `ios/<project>/`. */
const APPICONSET = path.join("Images.xcassets", "AppIcon.appiconset");
/** The brand tile, the ground `scripts/generate-icons.mjs` flattens onto. */
const TILE = "#1a1814";

/**
 * The default icon only. A dark or tinted variant is supposed to keep its
 * transparency, and `app.json` does not configure one.
 */
function isDefaultIcon(name) {
  return (
    name.endsWith(".png") &&
    !name.includes("-dark") &&
    !name.includes("-tinted")
  );
}

/** Every `AppIcon.appiconset` prebuild wrote, whatever it named the project. */
function appIconSets(projectRoot) {
  const iosDir = path.join(projectRoot, "ios");
  let entries;
  try {
    entries = fs.readdirSync(iosDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(iosDir, entry.name, APPICONSET))
    .filter((dir) => fs.existsSync(dir));
}

/**
 * Composite the icon onto the tile and drop the alpha band.
 *
 * `removeAlpha()` is the half that matters: sharp keeps the alpha band through
 * `flatten()` while the pipeline has one, and a file that carries an alpha
 * channel is refused even when every pixel in it is opaque. The channel count
 * of the result is returned so the caller can refuse to ship an RGBA icon
 * silently — the failure this plugin exists to prevent.
 */
async function flattenAppIconAsync(file) {
  // Loaded here rather than at the top of the file on purpose. A config plugin
  // is evaluated by every Expo command, including the ones that never touch an
  // iOS appiconset — `expo export --platform web`, an Android prebuild — and
  // sharp is a devDependency of this package. A top-level require would turn an
  // install that pruned devDependencies into a config-load failure on paths
  // that have nothing to do with this icon.
  const sharp = require("sharp");
  const { hasAlpha } = await sharp(file).metadata();
  if (!hasAlpha) return { flattened: false, channels: null };

  const { data, info } = await sharp(file)
    .flatten({ background: TILE })
    .removeAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });
  await fs.promises.writeFile(file, data);
  return { flattened: true, channels: info.channels };
}

module.exports = function withIosOpaqueIcon(config) {
  return withFinalizedMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const sets = appIconSets(projectRoot);
      if (sets.length === 0) {
        // Nothing to flatten. Prebuild writes no appiconset when `ios.icon` is
        // an `.icon` bundle — Icon Composer layers, not a PNG — or when this
        // platform was not prebuilt at all.
        console.log(
          "withIosOpaqueIcon: no AppIcon.appiconset under ios/, nothing to flatten",
        );
        return config;
      }

      const icons = sets.flatMap((dir) =>
        fs
          .readdirSync(dir)
          .filter(isDefaultIcon)
          .map((name) => path.join(dir, name)),
      );
      if (icons.length === 0) {
        throw new Error(
          `withIosOpaqueIcon: ${sets.join(", ")} holds no default icon PNG — the appiconset changed shape, so the icon the App Store reads is no longer checked here`,
        );
      }

      let flattened = 0;
      for (const file of icons) {
        const { flattened: changed, channels } = await flattenAppIconAsync(file);
        if (changed && channels !== 3) {
          throw new Error(
            `withIosOpaqueIcon: ${file} still has ${channels} channels after flattening`,
          );
        }
        if (changed) flattened += 1;
      }
      console.log(
        `withIosOpaqueIcon: ${flattened} of ${icons.length} AppIcon PNG(s) flattened onto ${TILE}, the rest were already opaque`,
      );
      return config;
    },
  ]);
};

module.exports.flattenAppIconAsync = flattenAppIconAsync;
