import { describe, expect, it } from "vitest";

import {
  RULED_BLOCK,
  RULED_BLOCK_PAGE,
} from "@/components/ui/ruledBlockClasses";

/**
 * The two rule forms, asserted as class *sets* rather than as strings.
 *
 * Ordering is not the contract — a tailwind class list has none — but the
 * membership is, and `expect(array).toEqual(array)` after a sort still
 * fails the moment a class is added, dropped or renamed. A `.toContain`
 * per class would drift in the other direction: it would pass on a block
 * that had quietly picked up a second border.
 *
 * Imported from `ruledBlockClasses.ts` and never from `RuledBlock.tsx`:
 * `apps/mobile/vitest.config.ts` is plain node with no renderer, and a
 * *value* import of a component file pulls in `react-native`, whose entry
 * point is Flow source that vitest cannot parse. Every other test in the
 * package dodges that with `import type` or `vi.mock`; these two strings
 * are exactly the thing that must stay importable, so they are asserted
 * here and that import below is the proof.
 */
const classes = (value: string) => value.trim().split(/\s+/).sort();

describe("RULED_BLOCK", () => {
  it("is one black rule, the space under it, and the block's own gap", () => {
    expect(classes(RULED_BLOCK)).toEqual(
      classes("border-t border-ink pt-6 gap-5"),
    );
  });

  it("carries no padding or margin beyond the rule's own pt-6", () => {
    // A block boundary is a rule and the space under it, and `pt-6` is
    // that space. What must not be here is padding on any *other* side --
    // a block boundary indents nothing and floats nothing -- nor a
    // negative margin, which is the escape hatch `apps/mobile/AGENTS.md`
    // forbids ("Never padding plus a matching negative margin either: the
    // margin pulls the box back out of its row") and which only exists to
    // undo a full-bleed band inside a constrained column.
    expect(RULED_BLOCK).toMatch(/\bpt-6\b/);
    expect(RULED_BLOCK).not.toMatch(/\b(px|py|p[lr])-\d/);
    expect(RULED_BLOCK).not.toMatch(/-m[trblxy]?-\d/);
    expect(RULED_BLOCK).not.toMatch(/\b(mx|my|m[lr])-\d/);
    // Exactly one border, as one side and one colour. Counting the
    // substring "border-" would call `border-t border-ink` two, and
    // counting side classes alone would miss a second colour.
    expect(
      classes(RULED_BLOCK).filter((name) => name.startsWith("border-")),
    ).toEqual(["border-ink", "border-t"]);
  });

  it("does not carry a title's classes: the title is a node, not a colour", () => {
    // A block rule that painted its own heading colour would be unable to
    // render a title at all, and this is the string a title-less site
    // shares with a titled one.
    expect(RULED_BLOCK).not.toMatch(/text-|font-/);
  });
});

describe("RULED_BLOCK_PAGE", () => {
  it("is a full-width hairline and nothing else", () => {
    expect(classes(RULED_BLOCK_PAGE)).toEqual(classes("h-px w-full bg-ink"));
  });

  it("paints the ink rather than wearing a border", () => {
    // `border-t` draws on the box it belongs to; the page rule belongs to
    // the page, and the page has no box. This is also the only `h-px` in
    // the app -- `design-lint.mjs` check 2 fails if a second one appears.
    expect(RULED_BLOCK_PAGE).not.toMatch(/border-/);
    expect(RULED_BLOCK_PAGE).not.toMatch(/\b(p|m)[trblxy]?-/);
  });

  it("is not the block rule with its padding removed", () => {
    // They are two different marks. If the page rule were ever folded
    // into the block form, the thirteen block sites would inherit an
    // `h-px` and the page would grow a border.
    expect(RULED_BLOCK_PAGE).not.toContain("pt-6");
    expect(RULED_BLOCK).not.toContain("h-px");
  });
});
