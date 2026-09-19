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
 */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView className="flex-1 bg-sand">
      <View className="mx-auto w-full max-w-[960px] px-6 py-6 md:px-12 md:py-10">
        {children}
      </View>
    </ScrollView>
  );
}
