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
  dismissHref = "/",
  children,
}: {
  title: string;
  primaryTitle: string;
  onPrimary: () => void;
  /** Where to land when there is no history to go back to. */
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
      <ActionBar primaryTitle={primaryTitle} onPrimary={onPrimary} />
    </View>
  );
}
