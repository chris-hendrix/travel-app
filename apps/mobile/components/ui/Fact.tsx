import type { ReactNode } from "react";
import { Text, View } from "react-native";

/**
 * One fact, as a ruled row: the noun the reader is looking for in the
 * quiet column, the answer in ink.
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
      <Text className="w-20 shrink-0 font-body text-sm text-ink opacity-60">
        {label}
      </Text>
      <View className="flex-1 gap-1">{children}</View>
    </View>
  );
}
