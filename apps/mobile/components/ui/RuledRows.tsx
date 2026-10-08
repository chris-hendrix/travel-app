import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { View } from "react-native";

import { RULE_ROW, RULE_SOFT } from "@/components/ui/ruledBlockClasses";

/**
 * The table rank: a soft rule above each of a table's rows.
 *
 * The test that picks this rank over the other two is **the direction the
 * row is read**. A row read *across* — a name, some accounts, a role — is a
 * table, and a table's rows need to know where one ends and the next
 * begins, so they keep a rule. A row read *down* is a list, and a list's
 * rows group by proximity alone; it keeps no mark at all. Same border, same
 * one pixel: the rank is what the row *means*, not how heavy it is drawn.
 *
 * This owns the mark and nothing else. The row body stays with each caller,
 * which is deliberate and follows `SuggestionList`, where a row keeps what
 * is its own: a wrapper around each row would have to own its padding, its
 * columns and its press state too, and it would then hide the
 * table-versus-list decision this component exists to make. The one `View`
 * below is a container for the rows, not a row.
 *
 * **It wraps the rows in a `View`, and that wrapper carries no class at
 * all.** That is the row rhythm, declared rather than inherited: every
 * call site is inside a stack that has a gap of its own — the admin list's
 * screen is `gap-4` and the roster's dialog body is `gap-5` — and a fragment
 * let that gap fall between the rows, so the container's pitch landed in the
 * middle of a table whose rows already carry their own (`py-3`). That is
 * what the wrapper is for, and
 * it is the only thing it is for: no padding, no margin, no width and no
 * gap, so the rows are still full-bleed in whatever holds them and the
 * measure does not move at any of the call sites.
 * `__tests__/ruled-block.test.ts` holds the wrapper to that — a component
 * that cannot see its container's gap is the only version of this that
 * cannot leak it — which is also why `RuledRows.tsx` is no longer a module
 * with no `react-native` import, and why that test file mocks it.
 *
 * **The first row gets no rule.** A table's own opening is the boundary
 * above it: the header's own chrome edge on the roster, the block rule that
 * opened the block on the admin list. A rule on the first row as well
 * would be a second mark for that one boundary, which is the thing the
 * rule book forbids — on the roster it would draw a soft line 24px under
 * the dialog header's ink one, straight down the middle of the screen.
 * So the rule separates the rows *from each other*, and the block above
 * the table is what closes it at the top.
 *
 * The rule is written once, in `ruledBlockClasses.ts`, and merged into a
 * child's existing `className` rather than replacing it. A child that
 * already carries the rule is left alone, so re-wrapping a row is not a
 * way to double it — and the dedupe test asks for `RULE_SOFT` rather than
 * typing `border-rule-soft`, because a hand-written copy of that string
 * here is a fourth spelling of the table rank and check 11 permits the
 * rank only in the module that declares it.
 */
export function RuledRows({ children }: { children: ReactNode }) {
  // `Children.toArray` drops the nulls and booleans a `&&` leaves behind,
  // so "the first row" is the first thing that actually renders rather
  // than the first slot in the JSX.
  const rows = Children.toArray(children);
  return (
    <View>
      {rows.map((child, index) => {
        if (!isValidElement(child) || index === 0) return child;
        const props = (child as ReactElement<{ className?: string }>).props;
        const existing = props.className ?? "";
        if (existing.split(/\s+/).includes(RULE_SOFT)) return child;
        return cloneElement(child as ReactElement<{ className?: string }>, {
          className: [existing, RULE_ROW].filter(Boolean).join(" "),
        });
      })}
    </View>
  );
}