import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { AppHeader } from "@/components/ui/AppHeader";
import { ActionBar } from "@/components/ui/ActionBar";
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
