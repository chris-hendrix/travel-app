import { useSyncExternalStore, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { Bell, User, X } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SCALLOP_DEPTH } from "@/components/ui/scallopTiles";
import { ScallopEdge } from "@/components/ui/ScallopEdge";
import { unreadCountOptions } from "@/lib/queries/notifications";
import { useStopImpersonation } from "@/lib/impersonation";
import { isSignedIn, subscribe } from "@/lib/sessionFlag";
import { useAuth } from "@/lib/authStore";
import { ImpersonationBand } from "@/components/ui/ImpersonationBand";
import { useZoneToken } from "@/lib/displayZone";
import { useMotion } from "@/hooks/useMotion";
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
 *
 * Which is why the wave is **out of layout** and hangs past the header's
 * own box, over the screen: the header is a flex *sibling* of the screen
 * rather than an overlay, so while the wave sat in the flow the only thing
 * behind it was the shell's ground, sand, and never the screen's content. A
 * band at the top of a screen showed a sand fringe above itself.
 *
 * Hanging it over the screen is what makes the transparency mean what it
 * says. The alternative — leaving the wave in the flow and painting it the
 * colour the screen declared — was tried and is worse: the tone is static,
 * so once that screen scrolls the cut-outs keep painting the band's colour
 * while the band itself has moved on, and a screen whose top is a photo, or
 * the impersonation strip, cannot be expressed at all. This needs no code
 * for any of them.
 *
 * The height the wave gives up is paid back as padding on the ink band, so
 * the header is exactly as tall as it was and no screen shifts.
 *
 * The strip itself — the period, the curve, the slack row and the direction
 * that turns the tile for a page's own bottom edge — is `scallopTiles.ts`,
 * and the box and the pattern are `ScallopEdge.tsx`. Both were lifted out of
 * this file when the boot cover needed the same edge at the other end of the
 * screen, because two edges of one app drawn from two copies of a curve is
 * how the second one starts drifting.
 */

/**
 * How far the wave's ink reaches *up* into the band it hangs from.
 *
 * The band's height is not always a whole number of pixels on native: its
 * content is text, and the row's `pb-3` is `0.75rem` — 12px on web and
 * **10.5px on Android**, because NativeWind's rem is 14 there against 16 on
 * web (A18). A fractional height means the band's bottom edge and the wave's
 * top edge can round apart by a device pixel, which shows as a hairline of
 * ground in what is meant to be one shape.
 *
 * One pixel of overlap costs nothing — it is ink on ink — and closes it on
 * every density without moving anything. It is carried by the wave's
 * *position*, so the wave's box stays exactly as deep as the wave.
 *
 * Fixing the `pb-3` instead would be the other way, and it is the wrong one:
 * it would move every screen in the app by 1.5px on Android to solve a
 * hairline.
 */
const WAVE_OVERLAP = 1;


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
  // The colour hook runs before the early return, with the zone read, and that
  // is the same fix as the one at the top of `AppHeader`: this used to sit
  // below `if (!zone)`, so a screen that registered a zone flipped this
  // component from one hook to two on the render its zone arrived — the
  // "change in the order of Hooks" class, invisible until React is asked to
  // count them. `useMotion` is a context read, so running it without a zone
  // costs nothing.
  const motion = useMotion();
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
      className={`pl-3 pr-1 py-3 ${motion.press}`}
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
  const motion = useMotion();

  // 24px icon in a 44pt box, so 10 above and 10 below: the band's row
  // centres boxes, and a box whose icon is not centred in it puts the
  // icon off the wordmark's line.
  return (
    <Link href="/notifications" asChild>
      <Pressable
        aria-label="Notifications"
        className={`pl-4 pr-1 py-2.5 ${motion.press}`}
      >
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
  const motion = useMotion();
  return (
    <Link href="/profile" asChild>
      <Pressable
        aria-label="Profile"
        className={`pl-4 pr-1 py-2.5 ${motion.press}`}
      >
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
  const motion = useMotion();
  return (
    // asChild so the target keeps its size: the word plus its padding
    // is a real 44pt box (py-3 around the word, pl-4 growing leftward
    // from the band's right edge, which does not move), with no negative
    // margin, so the band grows to hold it.
    <Link href="/login" asChild>
      <Pressable className={`pl-4 py-3 ${motion.press}`}>
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
  // Context only: this header renders OUTSIDE the layout's `<Suspense>`
  // (which wraps only `<Stack>` in `app/_layout.tsx`), so a `useQuery`
  // or `useSuspenseQuery` anywhere in this tree crashes the chrome on
  // every route. The stop hook below is local state and plain awaits,
  // never a query read.
  const { impersonating, status } = useAuth();
  const { stopping, stop } = useStopImpersonation();
  const motion = useMotion();
  // Hoisted above the branches below, and that is a fix rather than tidiness:
  // this context read used to live only in the title-less path, so the two
  // paths called a different number of hooks and the order changed on the
  // render that moved between them. React tolerates that in practice because a
  // route's `title` does not change under a mounted header — which is exactly
  // why it went unnoticed until a third path (the boot, which returns before
  // either) made the difference visible as "change in the order of Hooks called
  // by AppHeader". Every path through this component now runs the same four.
  const insets = useSafeAreaInsets();
  const band = impersonating ? (
    <ImpersonationBand
      displayName={impersonating.displayName || "No name"}
      onStop={() => void stop()}
      pending={stopping}
    />
  ) : null;

  // The band is not drawn while the stored session is being revalidated, and
  // that is two fixes in one. The first is geometric: the splash draws its mark
  // centred in the whole window, so a band above the body would push the boot
  // cover's mark down by the band's own height — a jump at the start of every
  // launch, on the one platform that has no crossfade to hide it. The second is
  // the sentence the band carries: `Sign in` is the one thing on screen that is
  // definitely false while a token is being revalidated, and it sat directly
  // above a line saying the app was signing you in.
  //
  // After all the hooks above, deliberately: `useStopImpersonation` and
  // `useMotion` run in both states, and an early return before them would
  // change the hook order between the boot and the screen that follows it.
  if (status === "restoring") return null;

  if (title) {
    return (
      <View>
        <View className="flex-row items-center justify-between border-b border-ink bg-gravel px-6 py-4">
          <Text className="font-display-semibold text-heading-lg text-ink">
            {title}
          </Text>
          <View className="flex-row items-center gap-0">
            <ZoneToken />
            {action}
            {onClose ? (
              <Pressable
                aria-label="Close"
                onPress={onClose}
                className={`pl-4 pr-1 py-2.5 ${motion.press}`}
              >
                <X color={INK} size={24} />
              </Pressable>
            ) : null}
          </View>
        </View>
        {band}
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
  //
  // `insets` is read with the other hooks, at the top of the component.

  // No ground of its own: the band paints ink and the wave is a
  // silhouette on transparent, so the negative space between the scallops
  // is whatever is behind the header rather than a sand bar drawn across
  // the top of the screen. The wave hangs into the screen below to make
  // that true of the screen's own ground and not just of the shell's.
  return (
    // `zIndex` and `overflow` are both here for the hanging wave, and they
    // are two different failure modes:
    //
    //   `zIndex` — the wave is a child of this box, not a sibling of the
    //   screen, so its own z-index is scoped inside whatever stacking the
    //   header has. Lifting the *header* is what actually puts the wave
    //   above the screen's opaque ground; without it the wave paints first
    //   and the screen's `bg-sand` covers it, which looks exactly like the
    //   wave having been deleted.
    //
    //   `overflow: visible` — the wave deliberately leaves this box. Web
    //   does not clip by default but Android's `View` does, so the same
    //   code would be right in a browser and flat on a phone. `visible` is
    //   the default on iOS and is a no-op on web; it is written down so the
    //   next reader knows the wave is supposed to leave.
    <View className="relative" style={{ zIndex: 2, overflow: "visible" }}>
      <View
        className="bg-ink"
        // The wave is out of the flow, so it contributes no height: it is
        // paid for here instead, or the header would be 10px shorter and
        // every screen in the app would sit 10px higher.
        style={{ paddingTop: insets.top, paddingBottom: SCALLOP_DEPTH }}
      >
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
      {/*
        Hangs SCALLOP_DEPTH past the header's box, over the top of the screen.
        `pointerEvents="none"` because it now covers the first 10px of the
        screen's touch surface and the wave is decoration — without it the
        crests would swallow taps on whatever sits at the top of a page.
        `zIndex` because it is drawn before the screen and has to land on
        top of it.

        Nothing is cut off by the overlap: every screen's content starts
        after its `Column`'s own top padding, so the 10px the wave covers is
        empty ground — the band's colour, or sand, or a photo, whichever is
        really there.
      */}
      <View
        // The box is exactly the wave's depth, and the *position* carries the
        // overlap — not the height. Adding a pixel of height instead puts
        // empty box under the svg, and a native svg that stretches into it
        // tiles the pattern a fraction past one row: the next tile's top row
        // is solid ink, so the seam becomes a 1px black line at the bottom
        // of the wave instead of a gap at the top. Growing the box traded one
        // artefact for a worse one; moving it trades nothing.
        //
        // So: `height: SCALLOP_DEPTH` on both platforms (never `h-2.5`, which
        // is `0.625rem` and 8.75px on Android — A18), and the box sits
        // `WAVE_OVERLAP` px higher than the band's edge.
        style={{
          height: SCALLOP_DEPTH,
          bottom: -(SCALLOP_DEPTH - WAVE_OVERLAP),
          zIndex: 1,
          overflow: "visible",
          pointerEvents: "none",
        }}
        className="absolute left-0 right-0"
      >
        <ScallopEdge direction="down" />
      </View>
      {band}
    </View>
  );
}
