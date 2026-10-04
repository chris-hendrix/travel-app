import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `expo-image` is imported in exactly one file, and that file is the one that
 * maps `className` onto `style`.
 *
 * This is a source census rather than a rendering test, for the reason
 * `__tests__/expo-policy.test.ts` and `__tests__/boot-cover.test.ts` give: the
 * mobile suite has no renderer (A9), and what has to stay true is a *shape* —
 * that no call site reaches around the wrapper — not a value.
 *
 * The shape is load-bearing and it already failed once, silently, on the
 * platform the product ships on. react-native-css's `globalClassNamePolyfill`
 * rewrites imports of `react-native` (and `react-native-safe-area-context`)
 * and nothing else, so a `className` on a third-party component is not a
 * style: on Android every photo was sized by nothing, collapsed to zero height
 * and vanished, while the stock photo beside it — a plain `View` with the same
 * class — still drew. On the web export the same prop happened to work,
 * because `expo-image`'s web implementation spreads its unknown props onto a
 * react-native-web `View` that *is* rewritten. So the failure is invisible to
 * every check this repo runs against the export, and visible only on the
 * phone. A second `from "expo-image"` anywhere in the tree is that bug again,
 * and nothing else in the suite would notice it.
 */
const mobileDir = path.resolve(__dirname, "..");

/** Where app code lives. The census reads source, not `node_modules`. */
const SOURCE_DIRS = ["app", "components", "hooks", "lib"];

const WRAPPER = path.join("components", "ui", "Image.tsx");

function sources(dir: string): string[] {
  const abs = path.join(mobileDir, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(rel);
    return /\.tsx?$/.test(entry.name) ? [rel] : [];
  });
}

/** Every `.ts`/`.tsx` file under `SOURCE_DIRS`, as repo-relative paths. */
const files = SOURCE_DIRS.flatMap(sources).sort();

const read = (rel: string) => fs.readFileSync(path.join(mobileDir, rel), "utf8");

/** `from "expo-image"` — never `expo-image-picker`, which is a different package. */
const IMPORTS_EXPO_IMAGE = /from\s+["']expo-image["']/;

describe("expo-image is reached through one wrapper", () => {
  it("covers the tree it claims to", () => {
    // A census over an empty or mis-rooted walk passes for the wrong reason.
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain(WRAPPER);
    expect(files).toContain(path.join("components", "ui", "PhotoCard.tsx"));
  });

  it("imports expo-image in exactly one file", () => {
    const importers = files.filter((rel) => IMPORTS_EXPO_IMAGE.test(read(rel)));
    expect(
      importers,
      "every image goes through components/ui/Image, which resolves `className` " +
        "into a style; a direct expo-image import sizes photos with nothing on Android",
    ).toEqual([WRAPPER]);
  });

  it("maps className onto style in that file", () => {
    const wrapper = read(WRAPPER);
    expect(wrapper).toContain("styled(");
    expect(wrapper).toContain('className: "style"');
  });

  it("leaves no image behind that a class cannot size", () => {
    // Every call site still passes `className`, so the wrapper is the only
    // thing standing between the class and a zero-height photo. If a call site
    // ever stops using one, it needs a `style` and this list is where to look.
    const classed = files.filter((rel) => /<Image[\s\S]{0,200}?className=/.test(read(rel)));
    expect(classed.length).toBeGreaterThanOrEqual(8);
    expect(classed).toContain(path.join("components", "ui", "PhotoCard.tsx"));
  });
});
