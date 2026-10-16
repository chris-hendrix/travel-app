/**
 * D7 — `Where` offers your words, once.
 *
 * A local free-text list offers the typed text as its **first** row: the
 * list is capped at five visible rows and scrolls, so a row appended last
 * is a row you scroll to find, and it is the one row that holds still
 * while the filtered rows churn under every keystroke. It is built
 * **after** the filter, from the trimmed query, so a trailing space —
 * a needle nothing matches — cannot take the row away.
 *
 * Two rules live here, both pure, because `apps/mobile/vitest.config.ts`
 * is plain node with no renderer and `Dropdown` is a React Native
 * component with no test harness on purpose (the `dropdown-label.test.ts`
 * precedent):
 *
 *   1. `withTypedRow` builds the row.
 *   2. `resolvePickedEntry` answers what a press commits — and it must
 *      consult the list that was *drawn* before the whole option set.
 *      The component rendered its filtered rows while resolving the
 *      press against `entries`, so a row that existed only in the drawn
 *      list was inert: it drew, and pressing it did nothing.
 *
 * The last describe reads `components/ui/Dropdown.tsx` off disk to hold
 * that wiring in place, the `travel-where-source.test.ts` way: the
 * resolution is inside the component, and nothing without a renderer can
 * press a row to find out.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  filterPickerEntries,
  resolvePickedEntry,
  withTypedRow,
  type PickerEntry,
} from "@/lib/dropdown";

const TRAVEL_WHERES: PickerEntry[] = [
  { value: "BCN T2", label: "BCN T2" },
  { value: "GVA", label: "GVA" },
  { value: "Valencia", label: "Valencia" },
];

/** What a local list's rows are: the filter, then the typed row. */
const localRows = (entries: PickerEntry[], query: string) =>
  withTypedRow(filterPickerEntries(entries, query, false), query);

describe("withTypedRow", () => {
  it("leads a local free-text list with what you typed", () => {
    // "bcn" is not any row's label, so the typed row is offered and leads
    // the rows the filter kept.
    const rows = localRows(TRAVEL_WHERES, "bcn");
    expect(rows[0]).toEqual({
      value: "bcn",
      label: '"bcn"',
      secondary: "Use what you typed",
      fieldText: "bcn",
    });
    expect(rows.map((row) => row.label)).toEqual(['"bcn"', "BCN T2"]);
  });

  it("is absent on an empty query", () => {
    // Nothing has a keystroke behind it, and the field's own value already
    // is the text: there is nothing to offer.
    expect(withTypedRow(TRAVEL_WHERES, "")).toEqual(TRAVEL_WHERES);
    expect(withTypedRow(TRAVEL_WHERES, "   ")).toEqual(TRAVEL_WHERES);
  });

  it("is suppressed when a row's label already matches, case-insensitively", () => {
    // This list is our own strings, so an exact match is the common case;
    // without the guard the field shows two rows for one airport.
    for (const query of ["BCN T2", "bcn t2"]) {
      const rows = localRows(TRAVEL_WHERES, query);
      expect(rows.map((row) => row.label), query).toEqual(["BCN T2"]);
    }
    // The comparison trims, so a padded query asks the same question of
    // the rows that are *drawn* — the whole of the rule, because the
    // component builds its rows as `withTypedRow(matches, query)` and
    // `filterPickerEntries` does not trim. A padded needle therefore
    // matches no label at all, the filter keeps nothing, and the typed row
    // (built from the trimmed text) is the whole list — the pre-existing
    // row is not drawn beside it. Nothing is suppressed here; the rule is
    // about the rows drawn, not about the option set behind them.
    expect(localRows(TRAVEL_WHERES, "  bcn t2  ")).toEqual([
      {
        value: "bcn t2",
        label: '"bcn t2"',
        secondary: "Use what you typed",
        fieldText: "bcn t2",
      },
    ]);
  });

  it("survives a query with a trailing space", () => {
    // The needle `"Val "` matches no label, so the filter keeps nothing —
    // and the row is built from the trimmed text afterwards rather than
    // injected before the filter, which is the spelling that would let a
    // trailing space filter it away for good.
    const rows = localRows(TRAVEL_WHERES, "Val ");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("Val");
    expect(rows[0]?.fieldText).toBe("Val");
  });
});

describe("resolvePickedEntry", () => {
  it("a value-and-label row still commits its value", () => {
    // A day row commits an ISO date while reading "Today · Fri Sep 19",
    // and the typed row's own value is the raw text: a press commits the
    // row's value either way, never its label.
    const entries: PickerEntry[] = [
      { value: "2026-09-19", label: "Today · Fri Sep 19" },
    ];
    const rows = localRows(entries, "Today");
    expect(resolvePickedEntry(rows, entries, "2026-09-19")?.value).toBe(
      "2026-09-19",
    );
  });

  it("pressing the typed row commits it, though no entry holds it", () => {
    // The bug this phase fixes: the row exists only in the list that was
    // drawn, so resolving against `entries` alone leaves it inert — it
    // draws and nothing happens. The drawn list is consulted first.
    const rows = localRows(TRAVEL_WHERES, "Val");
    expect(TRAVEL_WHERES.some((entry) => entry.value === "Val")).toBe(false);
    const pressed = resolvePickedEntry(rows, TRAVEL_WHERES, "Val");
    expect(pressed?.value).toBe("Val");
    // The field echoes `fieldText`, so the quotes marking "your words"
    // never reach it.
    expect(pressed?.fieldText).toBe("Val");
  });
});

describe("pressing the typed row commits", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "components", "ui", "Dropdown.tsx"),
    "utf8",
  );

  it("Dropdown resolves the press against the list it drew", () => {
    // Called as a function is not possible here (hooks, and no renderer),
    // so the wiring is read: `onPick` must resolve against the rows it
    // rendered, with `entries` only as the fallback. Swap the two
    // arguments and the typed row goes inert again.
    const args = source.match(/resolvePickedEntry\(([^)]*)\)/)?.[1];
    expect(args, "Dropdown does not resolve its press").toBeTruthy();
    const [drawn, whole] = (args ?? "").split(",").map((part) => part.trim());
    expect(drawn).toBe("rows");
    expect(whole).toBe("entries");
  });
});
