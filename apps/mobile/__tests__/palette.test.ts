import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { chroma, contrast, dE } from "@/lib/color";
import {
  ALL_TOKENS,
  BAND_CHROMA_MAX,
  BAND_TONES,
  GROUNDS,
  RESERVED,
  SEAM_MIN,
  TEXT_CHROMA_MAX,
  TOKENS,
  type Ground,
} from "@/lib/palette";

/**
 * The palette has three files and one description of it.
 *
 * `lib/palette.ts` says what each token is for and what it must clear;
 * `global.css` holds the values for anything styled with a class;
 * `lib/theme.ts` mirrors the few a prop needs. This test is the only
 * thing stopping the three from drifting, so it reads the other two from
 * disk rather than importing them — `global.css` is not a module, and a
 * mirror that is only checked in memory is not checked at all.
 */

const mobileDir = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(mobileDir, "global.css"), "utf8");
const theme = fs.readFileSync(path.join(mobileDir, "lib/theme.ts"), "utf8");

/** `--color-<name>: <value>;` from the @theme block, name → lowercase value. */
const cssTokens = new Map<string, string>(
  [...css.matchAll(/--color-([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [
    m[1]!,
    m[2]!.trim().toLowerCase(),
  ]),
);

/** `<CONST> = "<value>";` from lib/theme.ts, const → lowercase value. */
const themeTokens = new Map<string, string>(
  [...theme.matchAll(/export const ([A-Z_]+)\s*=\s*"([^"]+)"/g)].map((m) => [
    m[1]!,
    m[2]!.toLowerCase(),
  ]),
);

const constName = (name: string) => name.toUpperCase().replace(/-/g, "_");

describe("palette: every token lives where it says it does", () => {
  it("has a value in global.css for every css token", () => {
    const missing = TOKENS.filter((t) => t.home.includes("css")).filter(
      (t) => !cssTokens.has(t.name),
    );
    expect(missing.map((t) => t.name)).toEqual([]);
  });

  it("agrees with global.css on every value", () => {
    // A token that exists in both places with different values is the
    // drift this whole file exists to prevent.
    const drifted = TOKENS.filter((t) => t.home.includes("css"))
      .filter((t) => cssTokens.get(t.name) !== t.hex.toLowerCase())
      .map((t) => `${t.name}: palette ${t.hex} vs css ${cssTokens.get(t.name)}`);
    expect(drifted).toEqual([]);
  });

  it("has a mirror in lib/theme.ts for every prop-only token", () => {
    const drifted = TOKENS.filter((t) => t.home.includes("theme"))
      .filter((t) => themeTokens.get(constName(t.name)) !== t.hex.toLowerCase())
      .map((t) => t.name);
    expect(drifted).toEqual([]);
  });

  it("keeps the placeholder mirror on the quiet token's value", () => {
    // PLACEHOLDER is the one token with no class, so it is a duplicate by
    // necessity. Assert the duplicate rather than trust it.
    const quiet = TOKENS.find((t) => t.name === "grey-quiet");
    const placeholder = TOKENS.find((t) => t.name === "PLACEHOLDER");
    expect(placeholder?.hex).toBe(quiet?.hex);
  });

  it("declares no token it does not ship", () => {
    // Reserved tones are measured, not shipped: if one appears in the css
    // it is live, and the band set silently became three.
    const leaked = RESERVED.filter((t) => cssTokens.has(t.name)).map((t) => t.name);
    expect(leaked).toEqual([]);
  });
});

describe("palette: the rules a role implies", () => {
  it("holds every text token to its declared floor on every ground it names", () => {
    const failures: string[] = [];
    for (const token of TOKENS) {
      if (!token.floor) continue;
      for (const ground of token.floor.on) {
        const ratio = contrast(token.hex, GROUNDS[ground]);
        if (ratio < token.floor.min) {
          failures.push(
            `${token.name} on ${ground}: ${ratio.toFixed(4)} < ${token.floor.min}`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("gives every token that can be read a floor", () => {
    // The converse, so a text token cannot be added without one.
    const unfloored = TOKENS.filter((t) => t.role === "text" && !t.floor).map(
      (t) => t.name,
    );
    expect(unfloored).toEqual([]);
  });

  it("keeps every band tone calm", () => {
    const loud = TOKENS.filter((t) => t.role === "band")
      .filter((t) => chroma(t.hex) >= BAND_CHROMA_MAX)
      .map((t) => `${t.name} chroma ${chroma(t.hex).toFixed(3)}`);
    expect(loud).toEqual([]);
  });

  it("keeps every band tone a seam away from every ground", () => {
    const tooClose: string[] = [];
    for (const token of TOKENS.filter((t) => t.role === "band")) {
      for (const [ground, hex] of Object.entries(GROUNDS)) {
        const distance = dE(token.hex, hex);
        if (distance < SEAM_MIN) {
          tooClose.push(`${token.name} vs ${ground}: ${distance.toFixed(2)}`);
        }
      }
    }
    expect(tooClose).toEqual([]);
  });

  it("keeps the band tones apart from each other", () => {
    // Prose claimed this and no test made it, which is how a set of
    // grounds ends up reading as one ground.
    const names = BAND_TONES;
    const tooClose: string[] = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = TOKENS.find((t) => t.name === names[i])!;
        const b = TOKENS.find((t) => t.name === names[j])!;
        const distance = dE(a.hex, b.hex);
        if (distance < SEAM_MIN) {
          tooClose.push(`${a.name} vs ${b.name}: ${distance.toFixed(2)}`);
        }
      }
    }
    expect(tooClose).toEqual([]);
  });

  it("rejects a mark as a band, which is the rule's whole point", () => {
    const acid = TOKENS.find((t) => t.name === "acid")!;
    expect(acid.role).not.toBe("band");
    expect(chroma(acid.hex)).toBeGreaterThanOrEqual(BAND_CHROMA_MAX);
    // And the reason the rule exists: contrast alone would have let it
    // through. Read correctly too — `ink on acid` is the ratio that says
    // the label is legible; `acid on sand` is 1.00:1, because acid and
    // sand are the same lightness, which is exactly the failure a
    // contrast-only audit cannot see.
    expect(contrast("#000000", acid.hex)).toBeGreaterThan(4.5);
    expect(contrast(acid.hex, GROUNDS.sand)).toBeLessThan(1.1);
  });

  it("keeps the deep text tier under its own ceiling, exempt from the mark rule", () => {
    const overCeiling = TOKENS.filter((t) => t.role === "text")
      .filter((t) => chroma(t.hex) > TEXT_CHROMA_MAX)
      .map((t) => `${t.name} chroma ${chroma(t.hex).toFixed(3)}`);
    expect(overCeiling).toEqual([]);
  });

  it("proves ocean cannot carry text, which is why ocean-deep exists", () => {
    const ocean = TOKENS.find((t) => t.name === "ocean")!;
    expect(ocean.role).toBe("fill");
    for (const ground of ["sand", "paper", "gravel"] as Ground[]) {
      expect(contrast(ocean.hex, GROUNDS[ground])).toBeLessThan(4.5);
    }
  });

  it("records why the reserved tone was reserved", () => {
    // bpink passes every rule and is still not shipped. If it ever starts
    // failing one, this note is wrong rather than the decision.
    const bpink = RESERVED.find((t) => t.name === "bpink")!;
    expect(chroma(bpink.hex)).toBeLessThan(BAND_CHROMA_MAX);
    expect(dE(bpink.hex, GROUNDS.sand)).toBeGreaterThanOrEqual(SEAM_MIN);
    expect(bpink.home).toEqual([]);
  });
});

describe("palette: the list is complete", () => {
  it("describes every token the css defines", () => {
    // The other direction: a token added to global.css and forgotten here
    // would be untested, which is worse than being undocumented.
    const described = new Set(ALL_TOKENS.map((t) => t.name));
    const undeclared = [...cssTokens.keys()].filter((name) => !described.has(name));
    expect(undeclared).toEqual([]);
  });

  it("has no duplicate names", () => {
    const names = ALL_TOKENS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
