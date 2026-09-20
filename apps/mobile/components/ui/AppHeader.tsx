import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { Bell, User, X } from "lucide-react-native";
import Svg, { Defs, Path, Pattern, Rect } from "react-native-svg";
import { useNotifications } from "@/lib/notificationsStore";
import { useZoneToken } from "@/lib/displayZone";

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

/**
 * The zone the times on screen are in, stated once by the chrome rather
 * than on every time. Underlined, because a word with no affordance is a
 * word: this one flips between the trip's clock and your own.
 *
 * Renders nothing when no surface has registered a zone — the trips list
 * has no trip and no times, so it has nothing to say here.
 */
function ZoneToken({ onInk = false }: { onInk?: boolean }) {
  const zone = useZoneToken();
  if (!zone) return null;

  const colour = onInk ? "text-sand" : "text-ink";

  return (
    <Pressable
      accessibilityRole={zone.onFlip ? "button" : undefined}
      accessibilityLabel={
        zone.onFlip
          ? `Times in ${zone.label}, ${zone.abbr}. Switch clock`
          : `Times in ${zone.label}, ${zone.abbr}`
      }
      disabled={!zone.onFlip}
      onPress={() => zone.onFlip?.()}
      className="p-1"
    >
      <Text className={`font-body-bold text-sm ${colour} underline`}>
        {zone.abbr}
      </Text>
    </Pressable>
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
          <ZoneToken />
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
          <ZoneToken onInk />
          <BellButton />
          <AvatarButton />
        </View>
      </View>
      <WaveEdge />
    </View>
  );
}
