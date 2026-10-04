import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

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
 * is its own: a wrapper that owned the row would have to own its padding,
 * its columns and its press state too, and it would then hide the
 * table-versus-list decision this component exists to make.
 *
 * **No wrapper element.** It returns a fragment and hands each child the
 * rule, so putting a table inside it cannot change that table's layout —
 * which matters, because every call site is inside a full-bleed `Band` and
 * a stray `View` between a band and its rows would inset the measure.
 *
 * **The first row gets no rule.** A table's own opening is the boundary
 * above it: the block rule that opened the block on the landing, the
 * header's own chrome edge on the roster. A rule on the first row as well
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
    <>
      {rows.map((child, index) => {
        if (!isValidElement(child) || index === 0) return child;
        const props = (child as ReactElement<{ className?: string }>).props;
        const existing = props.className ?? "";
        if (existing.split(/\s+/).includes(RULE_SOFT)) return child;
        return cloneElement(child as ReactElement<{ className?: string }>, {
          className: [existing, RULE_ROW].filter(Boolean).join(" "),
        });
      })}
    </>
  );
}