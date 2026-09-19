import { Pressable, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";

/**
 * Pinned bottom bar for fullscreen dialogs: Back + one primary action.
 * No stacking — Back always returns to the previous screen.
 *
 * Bar chrome spans the screen, like the dialog header. On a phone the
 * action stacks under Back and fills the width; on wide screens it sits
 * opposite Back and hugs its label.
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
    <View className="gap-3 border-t border-ink bg-gravel px-6 py-4 md:flex-row md:items-center md:justify-between">
      <Pressable onPress={onBack}>
        <Text className="font-body-bold text-ink">← {backTitle}</Text>
      </Pressable>
      <View>
        <Button title={primaryTitle} onPress={onPrimary} />
      </View>
    </View>
  );
}
