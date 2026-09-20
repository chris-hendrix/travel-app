import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

/**
 * Screen ground and wide-screen frame.
 *
 * React Navigation paints its own background on every screen container
 * (#f2f2f2 on web), so the screen must paint its own sand.
 *
 * On wide screens the content sits in a centred column: at 960px the
 * inner width is 864px, which is exactly two 420px cards plus the gap,
 * so the grid fills its column instead of leaving a ragged edge.
 *
 * `lead` is for the screens that open on a display heading rather than on
 * content: the landing, the way in, and the invitation. They want air
 * above the first line that a list of rows does not, and before this it
 * was a magic `pt-4 md:pt-14` wrapper repeated in four screens.
 */
export function Screen({
  children,
  lead = false,
}: {
  children: ReactNode;
  lead?: boolean;
}) {
  return (
    <ScrollView className="flex-1 bg-sand">
      <View
        className={`mx-auto w-full max-w-[960px] px-6 md:px-12 ${
          lead ? "pb-6 pt-10 md:pb-10 md:pt-24" : "py-6 md:py-10"
        }`}
      >
        {children}
      </View>
    </ScrollView>
  );
}
