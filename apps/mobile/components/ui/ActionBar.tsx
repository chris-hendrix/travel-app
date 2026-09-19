import { Pressable, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";

/**
 * Pinned bottom bar for fullscreen dialogs: Back + one primary action.
 * No stacking — Back always returns to the previous screen.
 */
export function ActionBar({
  primaryTitle,
  onPrimary,
  onBack,
  backTitle = "Back",
}: {
  primaryTitle: string;
  onPrimary: () => void;
  onBack: () => void;
  backTitle?: string;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-t border-sand bg-ink px-6 py-4">
      <Pressable onPress={onBack}>
        <Text className="font-body-bold text-sand">← {backTitle}</Text>
      </Pressable>
      <View>
        <Button title={primaryTitle} variant="primary" onPress={onPrimary} />
      </View>
    </View>
  );
}
