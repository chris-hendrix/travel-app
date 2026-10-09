import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";

/**
 * The App Store icon has two halves, and this file only owns one of them.
 *
 * App Store Connect refuses a marketing icon that is transparent or carries an
 * alpha channel at all (ITMS-90717), so `assets/ios-icon.png` is the one icon
 * in the repo that cannot be RGBA. Every other icon here is RGBA by
 * construction — the Android launcher masks `adaptive-icon.png`, the splash is
 * a rounded square on transparency, the notification is a silhouette read from
 * its alpha — which is why the iOS one is flattened at the source in
 * `scripts/generate-icons.mjs`.
 *
 * That is the **generator's input**, and this file asserts it and nothing more:
 * the committed PNG's own header. The file Apple reads is not that file.
 * Prebuild re-encodes it through `@expo/image-utils`, and which branch of that
 * library runs decides the colour type of the appiconset it writes — RGBA when
 * sharp is the one it finds, colour type 2 when it falls back to jimp. The
 * second half of the story is `plugins/withIosOpaqueIcon.cjs`, registered in
 * `app.json` and asserted below; the asset prebuild actually writes is only
 * provable from a real `expo prebuild -p ios`.
 *
 * The header is read by hand rather than through sharp: the check is about
 * the bytes' own declaration of the file, and sharp is happy to report an
 * alpha channel that is fully opaque everywhere, which is the thing App Store
 * Connect rejects.
 */
const mobileDir = path.resolve(__dirname, "..");
const sourceIcon = path.join(mobileDir, "assets/ios-icon.png");

/** PNG colour types that carry an alpha channel. */
const WITH_ALPHA = new Map([
  [4, "grey + alpha"],
  [6, "RGBA"],
]);

function ihdr(file: string) {
  const bytes = fs.readFileSync(file);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!bytes.subarray(0, 8).equals(signature)) {
    throw new Error(`${file} is not a PNG`);
  }
  if (bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error(`${file} has no leading IHDR chunk`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colourType: bytes.readUInt8(25),
  };
}

/**
 * The PNG `@expo/image-utils` writes when it takes its sharp branch — that
 * package's `Image.resizeAsync`, which runs `ensureAlpha()` and then composites
 * a 3-channel white plate `dest-over`. The `.flatten()` branch below it in the
 * same function is never reached, so the appiconset arrives carrying an alpha
 * band: the case this test builds on purpose.
 */
async function sharpBranchIcon(file: string) {
  return sharp(file)
    .keepIccProfile()
    .ensureAlpha()
    .resize(1024, 1024, { fit: "cover", background: "transparent" })
    .composite([
      {
        input: {
          create: { width: 1024, height: 1024, channels: 3, background: "#ffffff" },
        },
        blend: "dest-over",
      },
    ])
    .png()
    .toBuffer();
}

type IconPlugin = {
  (config: PluginConfig): PluginConfig;
  flattenAppIconAsync: (
    file: string,
  ) => Promise<{ flattened: boolean; channels: number | null }>;
};

type PluginConfig = {
  ios?: { icon?: string };
  mods: {
    ios?: { finalized?: (config: unknown) => Promise<unknown> };
  };
};

/**
 * Load a CommonJS config plugin the way Expo loads it.
 *
 * `plugins/*.js` is CommonJS inside a `"type": "module"` package: Node refuses
 * to `require` it (the file is read as ESM, where `require` is not defined),
 * and Expo's resolver evaluates the file as CommonJS instead — which is why
 * `plugins/withAndroidSigning.cjs` has always worked. Reproducing that here is
 * what makes the plugin's transform testable at all.
 */
function loadPlugin(rel: string): IconPlugin {
  const file = path.join(mobileDir, rel);
  const loaded = { exports: {} as Record<string, unknown> };
  const evaluate = new Function(
    "require",
    "module",
    "exports",
    "__dirname",
    "__filename",
    fs.readFileSync(file, "utf8"),
  );
  evaluate(createRequire(file), loaded, loaded.exports, path.dirname(file), file);
  return loaded.exports as unknown as IconPlugin;
}

/** What prebuild writes: `withIosIcons` names the 1024px "any" icon this. */
const APPICON = "App-Icon-1024x1024@1x.png";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ios-icon-"));
});

describe("the iOS icon", () => {
  it("is the 1024px square the App Store asks for", () => {
    const { width, height } = ihdr(sourceIcon);
    expect({ width, height }).toEqual({ width: 1024, height: 1024 });
  });

  it("declares no alpha channel at all", () => {
    const { colourType } = ihdr(sourceIcon);
    expect(WITH_ALPHA.get(colourType)).toBeUndefined();
  });

  it("is the icon app.json points iOS at", () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(mobileDir, "app.json"), "utf8"),
    ) as { expo: { ios: { icon: string } } };
    expect(appJson.expo.ios.icon).toBe("./assets/ios-icon.png");
  });

  // The source-level flattening cannot be the whole guarantee, because the
  // appiconset is not that file. This is the other half, and it is registered
  // rather than hand-edited because `expo prebuild --clean` regenerates `ios/`.
  it("registers the plugin that re-flattens the generated appiconset", () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(mobileDir, "app.json"), "utf8"),
    ) as { expo: { plugins: unknown[] } };
    expect(appJson.expo.plugins).toContain("./plugins/withIosOpaqueIcon.cjs");
    expect(
      fs.existsSync(path.join(mobileDir, "plugins/withIosOpaqueIcon.cjs")),
      "plugins/withIosOpaqueIcon.cjs exists",
    ).toBe(true);
  });

  it("flattens an appiconset icon that arrives with an alpha band", async () => {
    const file = path.join(dir, APPICON);
    fs.writeFileSync(file, await sharpBranchIcon(sourceIcon));
    expect(ihdr(file).colourType).toBe(6);

    const plugin = loadPlugin("plugins/withIosOpaqueIcon.cjs");
    expect(await plugin.flattenAppIconAsync(file)).toEqual({
      flattened: true,
      channels: 3,
    });
    expect(ihdr(file).colourType).toBe(2);
    // The tile is opaque, so flattening onto it loses nothing: the pixels are
    // the source icon's own, with the alpha band gone.
    expect(
      (await sharp(file).removeAlpha().raw().toBuffer()).equals(
        await sharp(sourceIcon).removeAlpha().raw().toBuffer(),
      ),
    ).toBe(true);
  });

  // The plugin is a no-op wherever prebuild was already right — the jimp
  // branch, which calls `colorType(2)` — so it never re-encodes an icon that
  // has nothing wrong with it.
  it("leaves an already-opaque icon byte-for-byte alone", async () => {
    const file = path.join(dir, APPICON);
    fs.copyFileSync(sourceIcon, file);

    const plugin = loadPlugin("plugins/withIosOpaqueIcon.cjs");
    expect(await plugin.flattenAppIconAsync(file)).toEqual({
      flattened: false,
      channels: null,
    });
    expect(fs.readFileSync(file).equals(fs.readFileSync(sourceIcon))).toBe(true);
  });

  // The registered mod, called the way the mod compiler calls it: the entry
  // point has to find the appiconset under whatever project name prebuild
  // chose, which is the half a test of the transform alone would miss.
  it("flattens the appiconset the mod finds in the generated project", async () => {
    const projectRoot = path.join(dir, "project");
    const set = path.join(
      projectRoot,
      "ios",
      "Journiful",
      "Images.xcassets",
      "AppIcon.appiconset",
    );
    fs.mkdirSync(set, { recursive: true });
    fs.writeFileSync(path.join(set, APPICON), await sharpBranchIcon(sourceIcon));

    const plugin = loadPlugin("plugins/withIosOpaqueIcon.cjs");
    const config = plugin({ ios: { icon: "./assets/ios-icon.png" }, mods: {} });
    await config.mods.ios?.finalized?.({ modRequest: { projectRoot } });

    expect(ihdr(path.join(set, APPICON)).colourType).toBe(2);
  });
});
