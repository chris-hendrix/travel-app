import { Text, View } from "react-native";

/**
 * A screen that is getting there says so where its content will be.
 *
 * A plain line, not a spinner and not a skeleton: there is no motion
 * language in this system, and a skeleton is a promise about the shape
 * of content the request has not returned yet. The line sits in the
 * block the content will fill, ruled the same way, so arrival does not
 * rearrange the page.
 *
 * The label is what is loading, never "Loading…" on its own. A bare
 * "Loading…" with no noun is a screen that will not say what is late.
 */
export function LoadingBlock({ label }: { label: string }) {
  return (
    <View className="gap-2 border-t border-ink pt-6">
      <Text className="font-body text-sm text-ink opacity-60">{label}</Text>
    </View>
  );
}

