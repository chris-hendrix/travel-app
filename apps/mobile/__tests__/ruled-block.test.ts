import fs from "node:fs";
import path from "node:path";
import {
  Children,
  createElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, it, vi } from "vitest";

import {
  RULE_ROW,
  RULE_SOFT,
  RULED_BLOCK,
  RULED_BLOCK_PAGE,
  RULED_BLOCK_UNRULED,
} from "@/components/ui/ruledBlockClasses";
import { RuledRows } from "@/components/ui/RuledRows";

// `RuledRows` renders its rows inside a `View` — that wrapper is the row
// rhythm, and the test below is what holds it to carrying no gap. The only
// thing this mock has to stand in for is the element itself: the assertion
// reads the returned tree, never a rendered screen.
vi.mock("react-native", () => ({ View: "View" }));

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

describe("RULED_BLOCK_UNRULED", () => {
  it("is the block's own rhythm and nothing else", () => {
    expect(classes(RULED_BLOCK_UNRULED)).toEqual(classes("gap-5"));
  });

  it("carries no rule, which is the whole of why it exists", () => {
    // A block whose boundary is already drawn — the first block inside a
    // band — must not draw a second one. `global.css`'s rule book: "One rule
    // per boundary: a stack of blocks shares rules, it does not double them
    // at every seam."
    expect(RULED_BLOCK_UNRULED).not.toMatch(/border-/);
  });

  it("carries no padding either, because the space above belongs to the band", () => {
    // `RULED_BLOCK`'s `pt-6` is the space *under its rule*. With no rule
    // there is nothing to sit under, and the air above the block is the
    // band's column padding — so keeping the `pt-6` would reintroduce the
    // stacked padding this form exists to remove.
    expect(RULED_BLOCK_UNRULED).not.toMatch(/\bp[tyblrx]?-\d/);
    expect(RULED_BLOCK_UNRULED).not.toBe(RULED_BLOCK);
  });
});

describe("RULE_SOFT", () => {
  it("is the table rule's colour and nothing else", () => {
    // One spelling, in one file. `RuledRows` hands it to a row and no call
    // site writes it, which is the whole reason the component exists: the
    // mark was duplicated across four tables, not the row.
    expect(classes(RULE_SOFT)).toEqual(["border-rule-soft"]);
  });

  it("is a token, so the palette can measure it", () => {
    // A flattened `--color-rule-soft` rather than `border-ink/40`: an
    // opacity modifier is a value `lib/color.ts`'s `parseHex` throws on, so
    // a rule written as alpha could not be held to a floor at all.
    expect(RULE_SOFT).toMatch(/^border-[a-z-]+$/);
    expect(RULE_SOFT).not.toMatch(/\//);
  });
});

describe("RULE_ROW", () => {
  it("is one soft rule above the row, and the row's own padding left to it", () => {
    expect(classes(RULE_ROW)).toEqual(classes("border-t border-rule-soft"));
  });

  it("is the second rank, and is not the first one", () => {
    // The block rule is ink and carries `pt-6`; the table rule is soft and
    // carries nothing. If these ever folded together, a table row would
    // inherit a block's space and a block would inherit a rule it can no
    // longer see.
    expect(RULE_ROW).not.toContain("ink");
    expect(RULE_ROW).not.toContain("pt-6");
    expect(RULED_BLOCK).not.toContain("rule-soft");
    expect(RULE_ROW).not.toBe(RULED_BLOCK);
  });

  it("draws exactly one border, on one side, in one colour", () => {
    // The same shape as the block rule's assertion, for the same reason: a
    // list row that quietly picked up a second border would be a third rank.
    expect(
      classes(RULE_ROW).filter((name) => name.startsWith("border-")),
    ).toEqual(["border-rule-soft", "border-t"]);
  });

  it("leaves the block rule free of the hairline form, now that it is gone", () => {
    // The page hairline was withdrawn with its component. What it leaves
    // behind is only the negative: the block rule must not grow one.
    expect(RULED_BLOCK).not.toContain("h-px");
  });
});

/**
 * The wrapper that hands a row its mark.
 *
 * `RuledRows.tsx` is the one component this file imports by value, and it
 * is safe here because `react-native` is mocked above and everything else
 * it pulls in is `react` and the strings this file already imports. It is
 * called as a function rather than rendered: `vitest.config.ts` is plain
 * node with no renderer, and what is under test is which children come
 * back carrying a class and what the element they come back inside looks
 * like, which are questions about the returned element tree and not about
 * anything on a screen.
 */
describe("RuledRows", () => {
  const row = (className: string, key: string) =>
    createElement("View", { className, key });

  const renderedClasses = (children: ReactNode) => {
    const tree = RuledRows({ children }) as ReactElement<{
      children?: ReactNode;
    }>;
    return Children.toArray(tree.props.children).map(
      (child) => (child as ReactElement<{ className?: string }>).props.className,
    );
  };

  it("rules every row after the first, and leaves the first alone", () => {
    // A table's own opening is the boundary above it — the block rule
    // that opened the block on the landing, the dialog header's chrome
    // edge on the roster. A rule on the first row as well would be a
    // second mark for that one boundary, which is the rule book's one
    // thing it forbids.
    expect(
      renderedClasses([row("py-5", "a"), row("py-5", "b"), row("py-5", "c")]),
    ).toEqual(["py-5", `py-5 ${RULE_ROW}`, `py-5 ${RULE_ROW}`]);
  });

  it("counts the first row that renders, not the first slot", () => {
    // A `&&` that renders nothing must not make the first real row the
    // second child and rule it as if a row were above it.
    expect(
      renderedClasses([null, row("py-3", "a"), row("py-3", "b")]),
    ).toEqual(["py-3", `py-3 ${RULE_ROW}`]);
  });

  it("merges rather than replaces, and never doubles", () => {
    expect(renderedClasses([row("py-3", "a"), row(RULE_ROW, "b")])).toEqual([
      "py-3",
      RULE_ROW,
    ]);
  });

  it("passes the mark to a row component, which is what a roster row is", () => {
    // Two of the three call sites hand it a component rather than a `View`,
    // because the row is a body with a press state; the mark still has to
    // arrive, and still has to skip the first.
    const Row = (props: { className?: string }) =>
      createElement("View", { className: props.className });
    const classes = renderedClasses([
      createElement(Row, { key: "a" }),
      createElement(Row, { key: "b", className: "py-3" }),
    ]);
    expect(classes).toEqual([undefined, `py-3 ${RULE_ROW}`]);
  });

  it("puts the rows in a wrapper that carries no gap of its own", () => {
    // THE REGRESSION GUARD. Returning a fragment made every row a direct
    // flex child of whatever container the table sat in, so that
    // container's gap — `gap-5` on the landing's `Section`, `gap-4` on the
    // admin screen, `gap-5` in the roster's dialog body — was applied
    // between rows that already carry their own `py-3`/`py-5`. A row
    // pitch nobody declared, on three screens at once.
    //
    // So the wrapper is what owns the row rhythm, and it owns it by
    // carrying nothing: no `gap-*` (the failure itself), and no padding or
    // margin either, which is the other way a wrapper could quietly change
    // a table's measure.
    const tree = RuledRows({
      children: [row("py-3", "a"), row("py-3", "b")],
    }) as ReactElement<{ className?: string; children?: ReactNode }>;
    const wrapper = tree.props.className ?? "";
    expect(wrapper).not.toMatch(/(?:^|\s)gap-/);
    expect(wrapper).not.toMatch(/(?:^|\s)[a-z]*[mp][trblxy]?-/);
    // And the rows are inside it rather than beside it, so the container's
    // gap has exactly one child of its own to fall after.
    expect(Children.toArray(tree.props.children)).toHaveLength(2);
  });
});

/**
 * The mark has to arrive, not just be composed.
 *
 * The case above proves `RuledRows` hands a row component a `className`.
 * It cannot prove the component *uses* it: a stub that defines its own
 * compliance passes whether or not the real rows forward the prop, so if
 * `RosterRowView` or `AdminUserRowView` stopped putting the mark on their root,
 * every test in this file would still be green and the roster and the
 * admin list would quietly lose their table rule.
 *
 * So these read the two real row components off disk and assert the two
 * halves: the prop is destructured, and it reaches a `className`
 * expression. (`RosterRowView` is the roster row extracted to
 * components/trip/RosterList.tsx for the demo; it pulls in
 * `react-native` but no router and no query layer.) There is no renderer
 * here — a source-level assertion is the level this can honestly be held at.
 */
const mobileDir = path.resolve(__dirname, "..");

/**
 * One component's own source, comments stripped, split into its parameter
 * list and its body. Comments go because every one of these rows explains
 * the mark in prose, and a sentence that says `className` is not code that
 * forwards it.
 */
function rowComponent(file: string, name: string) {
  const src = fs
    .readFileSync(path.join(mobileDir, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/.*$/gm, (l) => " ".repeat(l.length));
  const at = src.indexOf(`function ${name}(`);
  expect(at, `${name} is not in ${file}`).toBeGreaterThan(-1);
  // From the opening brace of the parameter list to its matching close,
  // which is the destructuring this component receives the mark through.
  const open = src.indexOf("{", at + `function ${name}`.length);
  let depth = 1;
  let i = open + 1;
  while (depth > 0) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    i += 1;
  }
  return { params: src.slice(open, i), body: src.slice(i) };
}

const ROWS = [
  {
    file: "components/trip/RosterList.tsx",
    name: "RosterRowView",
    // The roster row's mark lands on its own wrapper. It used to sit
    // beside a viewer-conditional `Pressable` inside app/trips/members.tsx
    // (the organizer's rows pressed to the person dialog); the demo
    // extraction dropped the press — the rows are non-interactive — so
    // the wrapper is the row's only root, and the mark must stay on it.
    lands: /<View className=\{\[ROW_BODY, className\]/,
  },
  {
    file: "app/admin/users/index.tsx",
    name: "AdminUserRowView",
    // The admin row is one `Pressable`, and it is the root.
    lands: /className=\{\[[^\]]*\bclassName\b/,
  },
] as const;

describe.each(ROWS)("$name forwards the mark", (row) => {
  it("takes the mark as a prop", () => {
    expect(rowComponent(row.file, row.name).params).toMatch(
      /\bclassName\b\s*,/,
    );
  });

  it("puts it on the row itself", () => {
    expect(rowComponent(row.file, row.name).body).toMatch(row.lands);
  });
});

describe("the page hairline", () => {
  // Withdrawn by the rule book and reinstated on it: the trip page stopped
  // drawing it, then `BootCover` started. The constant and check 2's `h-px`
  // arm came back with the call site, and this holds them to each other.
  it("is a hairline with no padding and no title", () => {
    expect(RULED_BLOCK_PAGE.split(/\s+/).sort()).toEqual([
      "bg-ink",
      "h-px",
      "w-full",
    ]);
  });

  it("is not a block rule wearing a different box", () => {
    expect(RULED_BLOCK_PAGE).not.toContain("border-t");
    expect(RULED_BLOCK_PAGE).not.toContain("pt-");
  });

  it("has a caller — the boot cover draws the page's rule", () => {
    const boot = fs.readFileSync(
      path.join(mobileDir, "components/ui/BootCover.tsx"),
      "utf8",
    );
    expect(boot).toMatch(/import \{[^}]*PageRule[^}]*\}/);
    expect(boot).toMatch(/<PageRule\s*\/>/);
  });
});
