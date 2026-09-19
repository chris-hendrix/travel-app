import { Text, View } from "react-native";

/**
 * How soon the trip is, sitting on its cover.
 *
 * Shared by the card and the trip detail so the two can never drift —
 * the detail is meant to read as the card, opened.
 */
export function CountdownChip({ label }: { label: string }) {
  return (
    <View className="absolute left-3 top-3 rounded-full bg-watermelon px-3 py-1">
      <Text className="font-body-bold text-sm text-ink">{label}</Text>
    </View>
  );
}
