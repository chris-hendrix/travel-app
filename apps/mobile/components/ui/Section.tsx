import type { ReactNode } from "react";

import { RuledBlock } from "@/components/ui/RuledBlock";

/**
 * A titled block of a screen or a dialog, ruled off from the one above.
 *
 * Now a `RuledBlock` with its title made required. It was the fourth
 * copy of the same rule before this, and it is kept as a named export
 * because a caller that has a title to write should not have to remember
 * that the title is optional on the primitive — `Section` is the form for
 * when there is one, `RuledBlock` is the form for when there is not.
 *
 * The landing's sections were the reason this component had a shadow to
 * be confused with: they had their own local copy, set at the hero's own
 * scale, with the rule drawn *under* the run of rows rather than over the
 * block. Those two are tables of rows, so the shadow went with the rule —
 * the sections here, and `RuledRows` for the rows inside them.
 */
export function Section({
  title,
  rule = true,
  children,
}: {
  title: string;
  /** Passed through to `RuledBlock`: false where a band's edge is the seam. */
  rule?: boolean;
  children?: ReactNode;
}) {
  return (
    <RuledBlock title={title} rule={rule}>
      {children}
    </RuledBlock>
  );
}
