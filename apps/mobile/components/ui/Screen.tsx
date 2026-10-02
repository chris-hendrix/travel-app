import type { ReactNode } from "react";
import { ScrollView } from "react-native";

/**
 * The screen ground, and nothing else.
 *
 * React Navigation paints its own background on every screen container
 * (#f2f2f2 on web), so the screen must paint its own sand.
 *
 * It used to wrap its children in a constrained 960px column as well, and
 * that is now `Column`'s job. The split is forced by `Band`: a full-bleed
 * tone cannot exist inside a constrained column, and the negative-margin
 * escape hatch is forbidden (`apps/mobile/AGENTS.md`: "Never padding plus a
 * matching negative margin either: the margin pulls the box back out of its
 * row"). So the children own their own width:
 *
 *   <Screen>                        // this: the scroll and the ground
 *     <Column>…</Column>            // the ordinary case, and every screen
 *     <Band tone="lilac">           // the exception
 *       <Column>…</Column>
 *     </Band>
 *   </Screen>
 *
 * **The `lead` prop moved to `Column`; it did not retire.** `Screen.tsx`
 * carried the vertical rhythm — `py-6 md:py-10` and the `lead` variant — and
 * the whole restructure is inert only because the rhythm moved with the
 * width. A `Column` that kept the width and dropped the rhythm would have
 * changed every one of the sixteen call sites, and the six `lead` screens
 * (`login`, `verify`, `complete-profile`, `admin/users/index`, `+not-found`,
 * `invite`) would have lost their spacing outright.
 */
export function Screen({ children }: { children: ReactNode }) {
  return <ScrollView className="flex-1 bg-sand">{children}</ScrollView>;
}
