import type { ReactNode } from "react";
import { Text, View } from "react-native";

import {
  RULED_BLOCK,
  RULED_BLOCK_PAGE,
  RULED_BLOCK_UNRULED,
} from "@/components/ui/ruledBlockClasses";

/**
 * A block boundary: one black rule, taken from above.
 *
 * The rule is the point. A screen here is a stack of ruled blocks, and the
 * rule says where one ends: it sits on *top* of the block rather than
 * under it, so a stack of them shares its rules instead of doubling them
 * at every seam.
 *
 * The title is optional, and that is the whole reason this is a variant of
 * `Section` rather than a rename of it: eighteen of the thirty-nine call
 * sites have no title at all — a block rule over a single paragraph reads
 * as an accident until something names it, and a title nobody needed is a
 * heading that repeats what is under it. `Section` delegates here with a
 * title and keeps its required one; the untitled form is what the
 * diagnostics and dialogs have been hand-rolling all along, at three
 * different gaps.
 *
 * The heading is `heading-lg` (28px), the display floor `design-lint.mjs`
 * check 4 holds every display site to: a block boundary is the one thing
 * a reader reads at a glance rather than in a sentence, so it is not below
 * the floor, and it is not above it either — a rank is about what a mark
 * means, not about how loudly it is set.
 *
 * **This component used to export a second thing** — a full-width hairline
 * with no title and no padding, for a boundary that closes a multi-column
 * block and opens what is under it. It had exactly one call site, on the
 * trip page, and that site stopped needing it: the hero band's lower edge
 * closes both columns *and* changes the ground, so a rule on top of it was
 * a second mark saying one thing. With the last caller gone it was a
 * constant nothing renders, which is the same argument that retired the
 * lab's old disclosure: a form the app does not draw does not belong in the
 * rule book, because the rule book is a list of what the app draws.
 */
export function RuledBlock({
  title,
  rule = true,
  children,
}: {
  title?: string | undefined;
  /**
   * Whether to draw the boundary above. False for a block that is already
   * bounded from above — the first block inside a `Band`, whose edge is that
   * boundary — because a rule is a mark for a seam, and two marks for one
   * seam is the thing the rule book forbids.
   */
  rule?: boolean;
  children?: ReactNode;
}) {
  return (
    <View className={rule ? RULED_BLOCK : RULED_BLOCK_UNRULED}>
      {title ? (
        <Text className="font-display-semibold text-heading-lg uppercase text-ink">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/**
 * The page's own rule — a hairline with nothing under it, for a boundary
 * that closes what is above and opens what is under. The boot cover's is
 * the one that draws it: the splash's mark, then the page's rule, then the
 * page's foot.
 *
 * Not a `RuledBlock` with no children: that would carry the block's
 * padding and its inner gap for a line of ink, and `h-px` against
 * `border-t` is a different mark — a border belongs to the box it is on,
 * a page rule belongs to the page.
 */
export function PageRule() {
  return <View className={RULED_BLOCK_PAGE} />;
}
