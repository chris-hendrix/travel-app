import type { ReactNode } from "react";
import { ScrollView } from "react-native";

/**
 * Screen ground. React Navigation paints its own background on every
 * screen container — #f2f2f2 on web — which covers the shell's sand no
 * matter what the shell does. So the screen paints the ground itself,
 * and every screen uses this rather than a bare ScrollView.
 */
export function Screen({ children }: { children: ReactNode }) {
  return <ScrollView className="flex-1 bg-sand">{children}</ScrollView>;
}
