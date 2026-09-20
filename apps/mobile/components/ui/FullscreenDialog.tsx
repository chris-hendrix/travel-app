import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { AppHeader } from "@/components/ui/AppHeader";
import { ActionBar } from "@/components/ui/ActionBar";
import { Button } from "@/components/ui/Button";
import { useDismiss } from "@/hooks/useDismiss";

/**
 * Fullscreen dialog scaffold. Dialogs are routes, not overlays:
 * opening one switches screens, so dialogs can never stack.
 *
 * Header and action bar span the screen like app chrome; only the body
 * content sits in the centred column.
 */
export function FullscreenDialog({
  title,
  primaryTitle,
  onPrimary,
  primaryDisabled = false,
  dangerTitle,
  onDanger,
  dismissHref = "/trips",
  children,
}: {
  title: string;
  /** The dialog's one primary action. Omit it on a read-only dialog:
   *  a bar with nothing worth pressing is chrome for its own sake.
   *  Explicitly nullable so a caller can pass an optional lookup
   *  straight through — who is looking decides whether there is one. */
  primaryTitle?: string | undefined;
  onPrimary?: (() => void) | undefined;
  /** Present, not yet available. */
  primaryDisabled?: boolean;
  /**
   * The destructive action, when there is one. It is the scaffold's
   * rather than the form's because its position is the point: the foot
   * of the body, under a rule, as far from the primary button as the
   * dialog allows. Three dialogs drew that footer by hand and they had
   * already started to differ.
   */
  dangerTitle?: string | undefined;
  onDanger?: (() => void) | undefined;
  /** Where to land when there is no history to go back to. The app's
   *  own home by default: a dialog opened from nowhere belongs to the
   *  app, not to a document. */
  dismissHref?: string;
  children: ReactNode;
}) {
  const dismiss = useDismiss(dismissHref);

  return (
    <View className="flex-1 bg-gravel">
      <AppHeader title={title} onClose={dismiss} />
      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-[960px] gap-5 p-6 md:px-12 md:py-10">
          {children}
          {dangerTitle && onDanger ? (
            <View className="border-t border-ink pt-6">
              <Button
                title={dangerTitle}
                variant="danger"
                fullWidth
                onPress={onDanger}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
      {primaryTitle && onPrimary ? (
        <ActionBar
          primaryTitle={primaryTitle}
          onPrimary={onPrimary}
          disabled={primaryDisabled}
        />
      ) : null}
    </View>
  );
}
