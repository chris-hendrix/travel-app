import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { Bell, User } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";

function WaveEdge() {
  return (
    <Svg
      height={10}
      width="100%"
      viewBox="0 0 120 10"
      preserveAspectRatio="none"
    >
      <Path
        d="M0 0 H120 V5 Q112.5 10 105 5 T90 5 T75 5 T60 5 T45 5 T30 5 T15 5 T0 5 Z"
        fill="#42d177"
      />
    </Svg>
  );
}

function BellButton({ unread = true }: { unread?: boolean }) {
  return (
    <Link href="/notifications" asChild>
      <Pressable aria-label="Notifications" className="p-1">
        <View>
          <Bell color="#000000" size={24} />
          {unread ? (
            <View className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-strawberry" />
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

function AvatarButton() {
  return (
    <Link href="/profile" asChild>
      <Pressable aria-label="Profile" className="p-1">
        <User color="#000000" size={24} />
      </Pressable>
    </Link>
  );
}

export function AppHeader({
  title,
  backHref,
  action,
}: {
  title?: string;
  backHref?: "/design-system";
  action?: ReactNode;
}) {
  if (title) {
    return (
      <View className="flex-row items-center justify-between border-b border-gravel bg-sand px-6 py-4">
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

  return (
    <View className="bg-sand">
      <View className="flex-row items-center justify-between bg-seafoam px-6 pb-3 pt-4">
        <Link href="/" className="font-wordmark text-2xl text-ink">
          Journiful
        </Link>
        <View className="flex-row items-center gap-3">
          <BellButton />
          <AvatarButton />
        </View>
      </View>
      <WaveEdge />
    </View>
  );
}
