import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { FONTS } from "@/lib/fonts";

/**
 * The font table, bound in all four directions it can drift.
 *
 * `lib/palette.ts` + `palette.test.ts` already do this for colour: one TS
 * table, and a test that reads `global.css` off disk and fails if the two
 * disagree. Fonts never got the equivalent, so the family name lived as one
 * string in four files with nothing asserting they agreed — and a drift in
 * any one of them fails silently rather than loudly:
 *
 *   global.css drifts  -> paints the system fallback, embeds a font
 *                         nobody references, all tests green
 *   app.json drifts    -> the family is never embedded, so it *paints*
 *                         but does not *measure* — the "JOUR" bug
 *   _layout drifts     -> registered under a name nothing asks for
 *   the package drifts -> an import that no longer exists, which at least
 *                         is loud
 *
 * These are file reads, not renders, which is why they belong here: the
 * mobile suite is plain node with no renderer (A9).
 */
const mobileDir = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(mobileDir, rel), "utf8");

/** `--font-body-bold: "SpaceMono_700Bold", monospace;` */
function cssTokens() {
  const css = read("global.css");
  const found = new Map<string, { family: string; fallback: string }>();
  const re = /^\s*--(font-[a-z-]+):\s*"([^"]+)"\s*,\s*([a-z-]+)\s*;/gm;
  for (const m of css.matchAll(re)) {
    found.set(m[1]!, { family: m[2]!, fallback: m[3]! });
  }
  return found;
}

/** The `expo-font` plugin's list, which is what prebuild embeds. */
function embedded() {
  const appJson = JSON.parse(read("app.json")) as {
    expo: { plugins: Array<unknown> };
  };
  const plugin = appJson.expo.plugins.find(
    (p) => Array.isArray(p) && p[0] === "expo-font",
  ) as [string, { fonts: string[] }];
  expect(plugin, "expo-font plugin configured").toBeDefined();
  return plugin[1].fonts;
}

describe("lib/fonts.ts is the single source of truth", () => {
  it("names every token `global.css` declares, with the same family and fallback", () => {
    const css = cssTokens();
    const declared = FONTS.map((f) => f.token).sort();
    expect([...css.keys()].sort()).toEqual(declared);
    for (const row of FONTS) {
      expect(css.get(row.token), `${row.token} in global.css`).toEqual({
        family: row.family,
        fallback: row.fallback,
      });
    }
  });

  it("embeds every face it names in app.json, and nothing else", () => {
    // Both directions. Missing: the face paints but does not measure.
    // Extra: a font is shipped in the binary that no token names.
    const files = embedded();
    expect(files.slice().sort()).toEqual(FONTS.map((f) => f.file).sort());
  });

  it("resolves every file it names on disk", () => {
    for (const row of FONTS) {
      expect(
        fs.existsSync(path.join(mobileDir, row.file)),
        `${row.file} exists`,
      ).toBe(true);
    }
  });

  it("registers every export in a `useFonts` call in the root layout", () => {
    // Not `toContain` on the file: an export appears there **twice**, as an
    // import and as a registration, so a file-wide search still matches
    // after the registration is deleted. That is the failure worth catching
    // — imported but never registered means the face never loads and the
    // only symptom is the fallback — so the assertion is scoped to the
    // `useFonts({...})` bodies and the imports are ignored.
    const layout = read("app/_layout.tsx");
    const bodies = [
      ...layout.matchAll(/use(?:Fonts|SpaceMono)\(\{([^}]*)\}\)/g),
    ].map((m) => m[1]!);
    expect(bodies.length, "useFonts calls found").toBeGreaterThan(0);
    const registered = bodies.join("\n");
    for (const row of FONTS) {
      expect(
        new RegExp(`\\b${row.export}\\b`).test(registered),
        `${row.export} is registered, not merely imported`,
      ).toBe(true);
    }
  });

  it("names an export the package actually has", () => {
    // The strongest of the five: it catches a wrong or renamed export
    // without running Metro, which is the failure that otherwise surfaces
    // as a runtime fallback on one platform only.
    for (const row of FONTS) {
      const types = read(path.join("node_modules", row.pkg, "index.d.ts"));
      expect(
        new RegExp(`\\b${row.export}\\b`).test(types),
        `${row.pkg} exports ${row.export}`,
      ).toBe(true);
    }
  });

  it("keeps the family equal to the TTF's basename", () => {
    // On Android the basename *is* the family, so a family that differs
    // from the file resolves to nothing. This is the rule that makes the
    // four display weights four families rather than one with a weight
    // axis (A1), so it is asserted rather than assumed.
    for (const row of FONTS) {
      expect(row.family).toBe(path.basename(row.file, ".ttf"));
    }
  });

  it("gives each token a distinct family and fallback", () => {
    expect(new Set(FONTS.map((f) => f.token)).size).toBe(FONTS.length);
    expect(new Set(FONTS.map((f) => f.family)).size).toBe(FONTS.length);
    // The fallback is per-face and it differs on purpose: the display and
    // wordmark faces fall back to the system sans, the body face to the
    // system mono. A swap that copied one face's fallback onto another
    // would be invisible until a font failed to load.
    for (const row of FONTS) {
      expect(["sans-serif", "monospace"]).toContain(row.fallback);
    }
    expect(FONTS.find((f) => f.token === "font-body")?.fallback).toBe("monospace");
    expect(FONTS.find((f) => f.token === "font-display-black")?.fallback).toBe(
      "sans-serif",
    );
  });
});
