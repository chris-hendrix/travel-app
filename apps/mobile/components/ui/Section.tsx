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
 * The landing's sections are deliberately not either: they are tables of
 * rows, closed by a rule underneath and set at the hero's own scale, which
 * is a different block rather than a variant of this one. Folding those in
 * would mean two props serving one caller.
 */
export function Section({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return <RuledBlock title={title}>{children}</RuledBlock>;
}
