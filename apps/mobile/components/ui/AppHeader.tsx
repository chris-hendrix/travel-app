import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { Bell, User, X } from "lucide-react-native";
import Svg, { Defs, Path, Pattern, Rect } from "react-native-svg";
import { useNotifications } from "@/lib/notificationsStore";
import { useZoneToken } from "@/lib/displayZone";
import { INK, SAND } from "@/lib/theme";

/**
 * Scalloped bottom edge on the chrome band. A pattern tile keeps the
 * wave period fixed instead of stretching it across the viewport.
 *
 * The tile is exactly as deep as the wave, so the band's edge is the
 * wave and nothing else. Anything deeper than the curve leaves a strip
 * of ground running under the black across the full width, and the first
 * line of the page is cut off precisely at that line, which reads as the
 * header lying over the text rather than as a wavy edge the text passes
 * beneath.
 *
 * The pattern fills the ground between the crests with nothing: those
 * gaps are transparent, so what shows through them is whatever sits
 * behind the header, and the header paints only ink.
 */
const WAVE_DEPTH = 10;

function WaveEdge() {
  return (
    <View className="h-2.5 w-full">
      <Svg height={WAVE_DEPTH} width="100%">
        <Defs>
          <Pattern
            id="wave"
            x="0"
            y="0"
            width={28}
            height={WAVE_DEPTH}
            patternUnits="userSpaceOnUse"
          >
            <Path d="M0 0 H28 V6 Q21 14 14 6 Q7 0 0 6 Z" fill="#000000" />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height={WAVE_DEPTH} fill="url(#wave)" />
      </Svg>
    </View>
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
      // The word is small; the touch area reaches the 44pt floor via
      // padding with a matching negative margin, so the picture does
      // not move. hitSlop would also work on native but does nothing
      // to the element's box on the web build.
      className="p-3 -m-3"
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
      <Pressable aria-label="Notifications" className="p-2.5 -m-2.5">
        <View>
          <Bell color={SAND} size={24} />
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
      <Pressable aria-label="Profile" className="p-2.5 -m-2.5">
        <User color={SAND} size={24} />
      </Pressable>
    </Link>
  );
}

/**
 * Sign in: the way in, for someone who has read the landing.
 *
 * No underline, unlike the quiet words inside a screen. The rule is
 * that a word needs an underline when nothing else says it can be
 * pressed; in the band, the slot says it. That is why the bell and the
 * avatar here have never needed one either.
 *
 * The padding is the other half of that: the word is small, and a
 * fourteen-pixel tap target is not one. Only vertical, so it stays on
 * the band's own right edge.
 */
function SignInWord() {
  return (
    // asChild so the target keeps its size: the word plus its padding
    // reaches the 44pt floor, and the matching negative margin keeps
    // the band where it was.
    <Link href="/login" asChild>
      <Pressable className="p-3 -m-3">
        <Text className="font-body-bold text-sm text-sand">Sign in</Text>
      </Pressable>
    </Link>
  );
}

export function AppHeader({
  title,
  onClose,
  action,
  variant = "app",
}: {
  title?: string;
  onClose?: () => void;
  action?: ReactNode;
  /**
   * `landing` is the front door: the wordmark, and the word for the way
   * in. `bare` is the auth screens, which keep the wordmark alone.
   *
   * The wordmark is home wherever home exists: the trips list once you
   * are in the app, and the landing everywhere else, including on the
   * landing itself, where it is a no-op. A wordmark that is dead on one
   * screen and alive on the next reads as a broken link, and the cost of
   * the alternative is nothing.
   */
  variant?: "app" | "landing" | "bare";
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
            <Pressable aria-label="Close" onPress={onClose} className="p-2.5 -m-2.5">
              <X color={INK} size={24} />
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  const landing = variant === "landing";
  const app = variant === "app";

  // No ground of its own: the band paints ink and the wave is a
  // silhouette on transparent, so the negative space between the
  // scallops is whatever is behind the header rather than a sand bar
  // drawn across the top of the screen. Today that is the shell's sand,
  // which is why it looked right anyway; it stops being right the moment
  // a screen whose ground is not sand sits under this band, and a full
  // bleed photo or a coloured edge is exactly that.
  return (
    <View>
      <View className="flex-row items-center justify-between bg-ink px-6 pb-3 pt-4">
        {landing ? (
          // Still a link on the landing, where it points at the page you
          // are already on: the same word behaves the same way
          // everywhere it appears.
          <Link href="/" className="font-wordmark text-2xl text-sand">
            Journiful
          </Link>
        ) : (
          <Link
            href={app ? "/trips" : "/"}
            className="font-wordmark text-2xl text-sand"
          >
            Journiful
          </Link>
        )}
        <View className="flex-row items-center gap-3">
          {app ? (
            <>
              <ZoneToken onInk />
              <BellButton />
              <AvatarButton />
            </>
          ) : null}
          {landing ? <SignInWord /> : null}
        </View>
      </View>
      <WaveEdge />
    </View>
  );
}
