import { useSyncExternalStore, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { Bell, User, X } from "lucide-react-native";
import Svg, { Defs, Path, Pattern, Rect } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { unreadCountOptions } from "@/lib/queries/notifications";
import { isSignedIn, subscribe } from "@/lib/sessionFlag";
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
 * than on every time.
 *
 * Underlined when it can be pressed, and only then, because that is what
 * the underline means here: a word with no affordance is a word, and this
 * one flips between the trip's clock and your own. When the two clocks
 * read the same wall there is nothing to flip, so it is a readout — plain
 * ink, no press, no underline — rather than a button whose whole effect is
 * invisible. The bell and the avatar beside it need no underline because
 * the band's slot says they can be pressed; this is the one control in the
 * band that sometimes cannot be, so it is the one that has to say so.
 *
 * Renders nothing when no surface has registered a zone — the trips list
 * has no trip and no times, so it has nothing to say here.
 */
function ZoneToken({ onInk = false }: { onInk?: boolean }) {
  const zone = useZoneToken();
  if (!zone) return null;

  const colour = onInk ? "text-sand" : "text-ink";
  const flippable = zone.canFlip;

  return (
    <Pressable
      accessibilityRole={flippable ? "button" : undefined}
      accessibilityLabel={
        flippable
          ? `Times in ${zone.label}, ${zone.abbr}. Switch clock`
          : `Times in ${zone.label}, ${zone.abbr}`
      }
      disabled={!flippable}
      onPress={() => zone.onFlip?.()}
      // The word is small; the touch area is a real 44pt box: the
      // padding grows the element itself (pl-3 pr-1 py-3 around the
      // 20px word), with no negative margin, so the box sits inside its
      // row and the row grows to hold it. The padding is the same top
      // and bottom on purpose: a row centres boxes, not their contents,
      // so asymmetric padding puts the word off the centre line — 6px
      // above the wordmark beside it, which is exactly how far the box's
      // centre sat from the word's.
      className="pl-3 pr-1 py-3"
    >
      <Text
        className={`font-body-bold text-sm ${colour} ${
          flippable ? "underline" : ""
        }`}
      >
        {zone.abbr}
      </Text>
    </Pressable>
  );
}

function BellButton() {
  // Server-count badge (`GET /notifications/unread-count`). Explicit
  // state on purpose: this header renders OUTSIDE the layout's
  // `<Suspense>` (which wraps only `<Stack>` in `app/_layout.tsx`),
  // so a suspending read (`useSuspenseQuery`) would crash the chrome.
  // While loading the badge shows nothing; a failed count never
  // paints an error state in the header — the last known count (or
  // nothing) stays.
  // Signed out there is nothing to count, and asking anyway is an anonymous
  // 401 the API counts against its rate limiter. Same gate as the list's.
  const signedIn = useSyncExternalStore(subscribe, isSignedIn, isSignedIn);
  const { data } = useQuery({ ...unreadCountOptions(), enabled: signedIn });
  const unreadCount = data ?? 0;

  // 24px icon in a 44pt box, so 10 above and 10 below: the band's row
  // centres boxes, and a box whose icon is not centred in it puts the
  // icon off the wordmark's line.
  return (
    <Link href="/notifications" asChild>
      <Pressable aria-label="Notifications" className="pl-4 pr-1 py-2.5">
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
      <Pressable aria-label="Profile" className="pl-4 pr-1 py-2.5">
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
 * the band's own right edge — and equal above and below, so the word
 * sits on the same centre line as the wordmark and the icons.
 */
function SignInWord() {
  return (
    // asChild so the target keeps its size: the word plus its padding
    // is a real 44pt box (py-3 around the word, pl-4 growing leftward
    // from the band's right edge, which does not move), with no negative
    // margin, so the band grows to hold it.
    <Link href="/login" asChild>
      <Pressable className="pl-4 py-3">
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
        <View className="flex-row items-center gap-0">
          <ZoneToken />
          {action}
          {onClose ? (
            <Pressable aria-label="Close" onPress={onClose} className="pl-4 pr-1 py-2.5">
              <X color={INK} size={24} />
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  const landing = variant === "landing";
  const app = variant === "app";
  // The band paints its own top inset, so the status bar sits on ink rather
  // than on a strip of the shell's sand above it — one shape edge to edge,
  // which is what `_layout.tsx` pairs with light bar content. The inset goes
  // on this inner view and not on the wrapper below it, because the wrapper
  // is also the wave's parent: give *it* a ground and the scallops' negative
  // space fills with ink, which is a straight edge with a wavy top.
  const insets = useSafeAreaInsets();

  // No ground of its own: the band paints ink and the wave is a
  // silhouette on transparent, so the negative space between the
  // scallops is whatever is behind the header rather than a sand bar
  // drawn across the top of the screen. Today that is the shell's sand,
  // which is why it looked right anyway; it stops being right the moment
  // a screen whose ground is not sand sits under this band, and a full
  // bleed photo or a coloured edge is exactly that.
  return (
    <View>
      <View className="bg-ink" style={{ paddingTop: insets.top }}>
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
          <View className="flex-row items-center gap-0">
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
      </View>
      <WaveEdge />
    </View>
  );
}
