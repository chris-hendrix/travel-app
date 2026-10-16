import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { FONTS } from "@/lib/fonts";
import { endLabel, numberLabel, whereLabel } from "@/lib/transportMode";
import type { TransportMode } from "@journiful/shared/utils";

/**
 * The Fact column is as wide as the longest noun the app hands it.
 *
 * That is the component's whole contract (`components/ui/Fact.tsx`): the noun
 * sits in a fixed column so every row's answer starts on the same line down a
 * block, and the column is sized to the longest noun rather than to its own
 * content. Nothing renders in this suite — plain node, no renderer (A9) — so
 * the noun is measured here the way the browser measures it, from the metrics
 * of the face the app ships, and held against the width class the component
 * draws the column with.
 *
 * **Why a margin, and how much of one.** The noun's width is on no grid the
 * app lays out on: 13 cells of Space Mono at 14px is 111.384px, and the column
 * is a whole number of 4px. A `w-28` column is 112px, so it held that by
 * 0.6px — and 0.6px is not a fit, it is a coincidence of one rendering: the
 * label wears Tailwind's `text-sm`, while the app's own 14px step
 * (`global.css`'s `label`) carries +0.02em tracking, which is 0.28px a cell
 * and 3.6px over this noun, and the travel sheet has been seen wrapping
 * `Flight number` at 390px. On the native surface the same class is 14/16 of
 * the web's (NativeWind's rem is 14 there against 16 — `global.css` states it
 * above the scale) against type that shrinks with it, so the same 0.6px is the
 * whole margin there too.
 *
 * The rule is therefore: the column holds the longest noun **at the wider of
 * the two 14px types the app can put on it, with half a cell of the face to
 * spare** — 115.02 + 4.28 = 119.3px, which `w-30` (120px) clears and `w-29`
 * (116px), 0.98px over the noun, does not. Half a cell is the smallest
 * clearance that is not the coin-flip that failed: the old width held the noun
 * by a tenth of a cell, and a monospace column's own unit is the cell.
 *
 * The other end of the window is the screen's: on the travel sheet at 390px
 * the answers lose exactly what the column takes, and `Fri Dec 11 · 12:00 PM`
 * is 205.6px — one line in the 206px `w-30` leaves it, and `PM` alone on line
 * two in the 202px `w-31` leaves it. The column is the largest step that keeps
 * that value whole and the smallest that clears the noun, which is why there
 * is a measurement and not a preference here.
 */
const mobileDir = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(mobileDir, rel), "utf8");

/** A CSS length as a number of px. `em` is read against the type it scales. */
function cssPx(value: string, relativeTo: number): number {
  return value.endsWith("em")
    ? Number.parseFloat(value) * relativeTo
    : Number.parseFloat(value);
}

/**
 * The app's own 14px step: `--text-label` and its tracking.
 *
 * Read off `global.css` rather than typed, because that step is the one place
 * the app declares what a 14px label is — size and tracking are one decision
 * there. The component wears Tailwind's `text-sm` (the same 14px at the web's
 * 16px rem) with no tracking, and the scale's own step is the wider of the
 * two, so it is the one the column has to hold.
 */
function labelStep() {
  const css = read("global.css");
  const size = /^\s*--text-label:\s*([\d.]+px)\s*;/m.exec(css)?.[1];
  const tracking = /^\s*--text-label--letter-spacing:\s*([\d.]+em)\s*;/m.exec(
    css,
  )?.[1];
  expect(size, "--text-label in global.css").toBeDefined();
  expect(tracking, "--text-label--letter-spacing in global.css").toBeDefined();
  const px = cssPx(size!, 16);
  return { px, trackingPx: cssPx(tracking!, px) };
}

/** `w-28` is `28` spacing units of `0.25rem` — 4px each at the web's rem. */
const SPACING_PX = 4;

/**
 * The width class the column is drawn with, from the component's source.
 *
 * Exactly one, and the test says so: a second width in `Fact.tsx` would make
 * this read the wrong one silently, and the column's whole point is that one
 * number is behind it.
 */
function columnPx(): number {
  const source = read("components/ui/Fact.tsx");
  const matches = [...source.matchAll(/<Text className="[^"]*\bw-([\d.]+)\b/g)];
  expect(
    matches.map((m) => m[1]),
    "one width class on one `Text` in components/ui/Fact.tsx",
  ).toHaveLength(1);
  return Number.parseFloat(matches[0]![1]!) * SPACING_PX;
}

/**
 * The face the column's noun is set in, as a cell width.
 *
 * Space Mono is fixed-pitch, so every character is one cell and a noun's width
 * is its character count times the cell — which is also why the header tables
 * can be read as text at all. The cell is `hhea`'s largest advance over
 * `head`'s units-per-em, and `post.isFixedPitch` is asserted rather than
 * assumed: on a proportional face every number this file computes would be
 * wrong and nothing else here would notice.
 */
function face() {
  const row = FONTS.find((font) => font.token === "font-body");
  expect(row, "font-body in lib/fonts.ts").toBeDefined();
  const buf = fs.readFileSync(path.join(mobileDir, row!.file));
  const tables = new Map<string, number>();
  for (let i = 0; i < buf.readUInt16BE(4); i++) {
    const entry = 12 + i * 16;
    tables.set(
      buf.toString("ascii", entry, entry + 4),
      buf.readUInt32BE(entry + 8),
    );
  }
  const at = (tag: string) => {
    const offset = tables.get(tag);
    expect(offset, `${tag} table in ${row!.file}`).toBeDefined();
    return offset!;
  };
  const unitsPerEm = buf.readUInt16BE(at("head") + 18);
  const advance = buf.readUInt16BE(at("hhea") + 10);
  const fixedPitch = buf.readUInt32BE(at("post") + 12);
  expect(fixedPitch, `${row!.family} is fixed-pitch`).toBe(1);
  return { unitsPerEm, advance };
}

/** The cell, and the noun it has to hold, in the app's own type. */
function longestNoun(px: number) {
  const { unitsPerEm, advance } = face();
  const cell = (advance / unitsPerEm) * px;
  const noun = nouns().sort((a, b) => b.length - a.length)[0]!;
  return { cell, noun };
}

/**
 * Every noun the app puts in the column.
 *
 * Two sources, because the labels come from two places: the literals at the
 * call sites (`<Fact label="Check out">`) and the mode's own tables, which the
 * travel sheet reads through `lib/transportMode.ts` rather than typing out
 * again. Neither alone is the set — the longest noun the app carries today is
 * one of the table's (`Flight number`) — so both are read and the widest wins.
 */
function nouns(): string[] {
  const modes: TransportMode[] = [
    "flight",
    "train",
    "bus",
    "car",
    "rental",
    "other",
  ];
  const sides = ["departure", "arrival"] as const;
  const fromTables = [
    ...modes.flatMap((mode) => sides.map((side) => whereLabel(mode, side))),
    ...modes.flatMap((mode) => sides.map((side) => endLabel(mode, side))),
    ...modes.map((mode) => numberLabel(mode)).filter((label) => label !== null),
  ];
  const literals: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx")) {
        const source = fs.readFileSync(full, "utf8");
        for (const m of source.matchAll(/<Fact\b[^>]*?label="([^"]+)"/g)) {
          literals.push(m[1]!);
        }
      }
    }
  };
  for (const dir of ["app", "components"]) walk(path.join(mobileDir, dir));
  expect(
    literals.length,
    "Fact call sites with a literal label",
  ).toBeGreaterThan(5);
  return [...new Set([...literals, ...fromTables])];
}

describe("the Fact column fits the longest noun the app carries", () => {
  it("measures the noun the way the browser draws it", () => {
    // The model, pinned to a rendering: the browser reports 111.3906px for
    // this string at 14px, which is this 111.384 held in its 1/64px unit.
    const { px } = labelStep();
    const { cell, noun } = longestNoun(px);
    expect(cell).toBeCloseTo(8.568, 3);
    expect(noun).toBe("Flight number");
    expect(Number((noun.length * cell).toFixed(3))).toBe(111.384);
  });

  it("holds it on one line, at the widest 14px type the app wears, with half a cell to spare", () => {
    const { px, trackingPx } = labelStep();
    const { cell, noun } = longestNoun(px);
    const widest = noun.length * (cell + trackingPx);
    const required = widest + cell / 2;
    expect(
      columnPx(),
      `a ${columnPx()}px column against ${noun}'s ${widest.toFixed(2)}px ` +
        `(${noun.length} cells at ${px}px with +${trackingPx}px tracking) + half a ` +
        `${cell.toFixed(3)}px cell = ${required.toFixed(2)}px`,
    ).toBeGreaterThanOrEqual(required);
  });
});
