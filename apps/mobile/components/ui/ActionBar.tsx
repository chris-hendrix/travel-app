import { View } from "react-native";
import { Button } from "@/components/ui/Button";

/**
 * Pinned bottom bar for fullscreen dialogs: one primary action.
 *
 * There is deliberately no Back here. Dismissal belongs to the header's
 * close control and the platform's own gesture — swipe down on iOS,
 * hardware back on Android — so a second Back control is redundant.
 * Back only earns its place when a dialog is a multi-step wizard, where
 * it would mean "previous step" rather than "leave".
 *
 * Fills the width on a phone; on wide screens it hugs the right edge.
 */
export function ActionBar({
  primaryTitle,
  onPrimary,
}: {
  primaryTitle: string;
  onPrimary: () => void;
}) {
  return (
    <View className="border-t border-ink bg-gravel px-6 py-4">
      <Button title={primaryTitle} onPress={onPrimary} align="end" />
    </View>
  );
}
