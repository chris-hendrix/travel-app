import type { ReactNode } from "react";
import { Text, View } from "react-native";

/**
 * One fact, as a ruled row: the noun the reader is looking for in the
 * quiet column, the answer in ink.
 *
 * The column is as wide as the longest noun the app carries —
 * `Temperature`, on the admin record — so it is fixed rather than
 * sized to its content: every row's answer then starts on the same
 * line down a block, which is the whole reason the noun sits in a
 * column of its own. It was 80px, which fits `Check out` and broke
 * `Temperature` mid-word ("Temperat" / "ure") on a 390px screen,
 * because a `<Text>` with no room breaks wherever it must rather
 * than at a word.
 */
export function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View className="flex-row gap-4">
      <Text className="w-28 shrink-0 font-body text-sm text-ink opacity-60">
        {label}
      </Text>
      <View className="flex-1 gap-1">{children}</View>
    </View>
  );
}
