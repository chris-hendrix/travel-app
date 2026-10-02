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
/**
 * A dialog's foot and a screen's foot are two different things, and the
 * differences all follow from one question: **does content scroll under it?**
 *
 * `dialog` — yes. The body scrolls beneath a pinned bar, so the rule is what
 * says where the bar begins, and the padding is a thumb's. The ground is
 * gravel because a dialog's ground is gravel: `_layout.tsx` records why, "a
 * bar whose content disagrees with its ground is the one state nobody can
 * read."
 *
 * `screen` — no, but it keeps the rule for the opposite reason. Nothing
 * passes under it, so the rule is not marking a boundary with scrolling
 * content; it is marking the bar *at all*, because the ground here is sand
 * and sand is the page. Without it the bar is invisible and the button reads
 * as the last thing in the content rather than as the page's action.
 */
const VARIANTS = {
  dialog: "border-t border-ink bg-gravel px-6 py-4",
  screen: "border-t border-ink bg-sand px-6 py-4",
} as const;

export function ActionBar({
  primaryTitle,
  onPrimary,
  disabled = false,
  variant = "dialog",
}: {
  primaryTitle: string;
  onPrimary: () => void;
  /** A dialog's foot by default, because a dialog is the common case. */
  variant?: keyof typeof VARIANTS;
  /**
   * The action is real and not yet available: a dialog that needs
   * something picked before it can be sent says so in place rather than
   * hiding the bar, which would leave the thumb with nowhere to land.
   */
  disabled?: boolean;
}) {
  return (
    <View className={VARIANTS[variant]}>
      <Button
        title={primaryTitle}
        onPress={onPrimary}
        align="end"
        disabled={disabled}
      />
    </View>
  );
}
