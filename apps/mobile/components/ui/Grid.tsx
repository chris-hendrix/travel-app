import type { ReactNode } from "react";
import { View } from "react-native";

/**
 * A wrapping row of fixed-width cards — two across at the page's wide
 * column, one on a phone.
 *
 * Never let a child grow on this row: an orphan card in the last row
 * would swell to the full width and the grid would look broken.
 */
export function Grid({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-x-6 gap-y-8">{children}</View>;
}
