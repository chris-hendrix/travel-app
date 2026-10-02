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
 * `Section` rather than a rename of it: eleven of the thirteen sites had
 * no title at all — a block rule over a single paragraph reads as an
 * accident until something names it, and a title nobody needed is a
 * heading that repeats what is under it. `Section` delegates here with a
 * title and keeps its required one; the untitled form is what the
 * diagnostics and dialogs have been hand-rolling all along, at three
 * different gaps.
 *
 * The heading keeps `Section`'s own `text-xl` display treatment rather
 * than moving to the 28px `heading-lg` the floor guard will want. Phase 3
 * does not pre-empt Phase 5: every one of the thirteen sites has to land
 * looking identical first, and the scale moves in one pass afterwards.
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
 * that closes a multi-column block and opens what is under it. The one
 * site is the trip page's, where the block above it is two columns and
 * the rule says "that was a grid, this is the next thing".
 *
 * Not a `RuledBlock` with no children: that would carry the block's
 * padding and its inner gap for a line of ink, and `h-px` against
 * `border-t` is a different mark — a border belongs to the box it is on,
 * a page rule belongs to the page.
 */
export function PageRule() {
  return <View className={RULED_BLOCK_PAGE} />;
}
