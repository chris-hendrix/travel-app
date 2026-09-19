import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Link } from "expo-router";

export function AppHeader({
  title,
  backHref,
  action,
}: {
  title: string;
  backHref?: "/design-system";
  action?: ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between bg-seafoam px-6 py-4">
      <View className="flex-row items-center gap-3">
        {backHref ? (
          <Link href={backHref} className="font-body-bold text-ink">
            ← Back
          </Link>
        ) : null}
        <Text className="font-display text-2xl leading-none text-ink">
          {title}
        </Text>
      </View>
      {action}
    </View>
  );
}
