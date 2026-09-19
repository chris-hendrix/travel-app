import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { Bell, User, X } from "lucide-react-native";
import Svg, { Defs, Path, Pattern, Rect } from "react-native-svg";
import { useNotifications } from "@/lib/notificationsStore";

/**
 * Scalloped bottom edge on the chrome band. A pattern tile keeps the
 * wave period fixed instead of stretching it across the viewport.
 */
function WaveEdge() {
  return (
    <Svg height={12} width="100%">
      <Defs>
        <Pattern
          id="wave"
          x="0"
          y="0"
          width={28}
          height={12}
          patternUnits="userSpaceOnUse"
        >
          <Path d="M0 0 H28 V6 Q21 12 14 6 T0 6 Z" fill="#000000" />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height={12} fill="url(#wave)" />
    </Svg>
  );
}

function BellButton() {
  const { unreadCount } = useNotifications();

  return (
    <Link href="/notifications" asChild>
      <Pressable aria-label="Notifications" className="p-1">
        <View>
          <Bell color="#f5eacc" size={24} />
          {unreadCount > 0 ? (
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
        <User color="#f5eacc" size={24} />
      </Pressable>
    </Link>
  );
}

export function AppHeader({
  title,
  onClose,
  action,
}: {
  title?: string;
  onClose?: () => void;
  action?: ReactNode;
}) {
  if (title) {
    return (
      <View className="flex-row items-center justify-between border-b border-ink bg-gravel px-6 py-4">
        <Text className="font-display text-2xl leading-none text-ink">
          {title}
        </Text>
        <View className="flex-row items-center gap-3">
          {action}
          {onClose ? (
            <Pressable aria-label="Close" onPress={onClose} className="p-1">
              <X color="#000000" size={24} />
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View className="bg-sand">
      <View className="flex-row items-center justify-between bg-ink px-6 pb-3 pt-4">
        <Link href="/" className="font-wordmark text-2xl text-sand">
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
