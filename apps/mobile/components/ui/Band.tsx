import type { ReactNode } from "react";
import { View } from "react-native";

import { BAND_CLASSES, type BandTone } from "@/components/ui/bandClasses";

/**
 * A pale tone, full bleed.
 *
 * The one thing in this system that breaks the column on purpose. Everything
 * else is content and belongs in the 960px measure; a band is a *ground*, so
 * it runs edge to edge and the content inside it goes back into a `Column`.
 * That is the whole reason `Screen` stopped wrapping its children: a
 * full-bleed band cannot exist inside a constrained column, and the
 * negative-margin workaround is forbidden (`apps/mobile/AGENTS.md`: "Never
 * padding plus a matching negative margin either: the margin pulls the box
 * back out of its row").
 *
 *   <Screen>                        // scroll + sand; children own their width
 *     <Column>…</Column>            // the ordinary case
 *     <Band tone="lilac">           // the exception
 *       <Column>…</Column>
 *     </Band>
 *   </Screen>
 *
 * A band carries no padding of its own. The `Column` inside it does, so the
 * content in a band lines up with the content above and below it — which is
 * the only reason the seam reads as a band and not as a mistake.
 *
 * **One at a time.** Two bands are never adjacent: they are both grounds and
 * the seam between them would say "these are two things" when a reader has
 * no way to know what the division means. `design-lint.mjs` check 5 fails on
 * siblings with no sand between them.
 *
 * Colour rule: text on a band is `ink`, and a band never holds a form field.
 * React Native cannot read a CSS variable into a prop (A5), so a placeholder,
 * an icon colour or a caret inside a band could not invert with it.
 */
export function Band({
  tone,
  children,
}: {
  tone: BandTone;
  children: ReactNode;
}) {
  return <View className={`w-full ${BAND_CLASSES[tone]}`}>{children}</View>;
}
