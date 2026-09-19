import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { AppHeader } from "@/components/ui/AppHeader";
import { ActionBar } from "@/components/ui/ActionBar";

/**
 * Fullscreen dialog scaffold. Dialogs are routes, not overlays:
 * opening one switches screens, so dialogs can never stack.
 */
export function FullscreenDialog({
  title,
  primaryTitle,
  onPrimary,
  children,
}: {
  title: string;
  primaryTitle: string;
  onPrimary: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <View className="flex-1 bg-sand">
      <AppHeader title={title} onClose={() => router.back()} />
      <ScrollView className="flex-1">
        <View className="gap-4 p-6">{children}</View>
      </ScrollView>
      <ActionBar
        primaryTitle={primaryTitle}
        onPrimary={onPrimary}
        onBack={() => router.back()}
      />
    </View>
  );
}
