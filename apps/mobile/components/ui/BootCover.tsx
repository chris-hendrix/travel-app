import { Image, Text, View } from "react-native";
import Animated, { FadeIn, StretchInX } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Column } from "@/components/ui/Column";
import { PageRule } from "@/components/ui/RuledBlock";
import { ScallopEdge } from "@/components/ui/ScallopEdge";
import { EASE_MOTION } from "@/lib/motion";
import { markOffset, SPLASH_IMAGE_WIDTH } from "@/lib/boot";

/**
 * The boot, on screen: the splash's own mark, then the page's rule, then the
 * page's foot.
 *
 * ## Why this exists at all
 *
 * The app used to say what it was doing in a mono line at the top of a column,
 * and it said it in **two** places that did not agree with each other: the root
 * `Suspense` in `app/_layout.tsx` drew a bare `LoadingBlock` with no column,
 * and `app/index.tsx`'s `restoring` branch drew the same line inside a `Screen`
 * and a `Column`. Both of them replaced the splash with something that was not
 * the splash — sand with a small line in the top-left corner, under a band that
 * was not there a frame earlier — and the band itself carried `Sign in`, which
 * is the one thing on screen that is definitely untrue while a stored session
 * is being revalidated.
 *
 * ## The first frame is not a design decision
 *
 * On Android there is no crossfade between the splash and this: `setOptions`'
 * `fade` is iOS-only, so the system's mark disappears and the first JS frame
 * appears in one frame. That means the first frame of this component has to be
 * the splash — the same asset (`assets/splash.png`, the same file the plugin
 * draws), at the same width (`SPLASH_IMAGE_WIDTH`, which
 * `__tests__/boot-cover.test.ts` holds to `app.json`'s `imageWidth`), **at the
 * same position on the same `sand`**. Nothing else is on screen yet, and that is
 * the point: the mark, the rule and the foot all arrive *after* it, so a launch
 * is one thing moving rather than two things swapping.
 *
 * The mark is therefore **not** animated. It cannot arrive; it was already
 * there.
 *
 * ## Position is the whole of "the same position", and it is arithmetic
 *
 * The splash centres the mark in the **window**. This component sits inside the
 * shell's content box, which reserves `insets.bottom` for the gesture bar (every
 * route does), so a mark centred naively in that box would paint `insets.bottom
 * / 2` above the splash's — and everything below the mark would subtract from
 * that box, putting it further out again. Two things make it exact:
 *
 * - the mark has a **centring box of its own**, padded by the full inset, which
 *   moves the centre of that box down by half of it (a box `H` tall with
 *   `paddingTop: b` centres its content at `b + (H - b)/2 = (H + b)/2`);
 * - the rule, the label and the foot are taken **out of the flow** so that
 *   nothing they do can move the mark. The rule is placed from the mark's own
 *   bottom edge by arithmetic rather than by flow, and the foot is pinned.
 *
 * This was wrong in the first version of this file — the mark was centred as one
 * group *with* the rule and the label, which is a group roughly twice the mark's
 * height, so it painted tens of pixels above where the splash draws it. The
 * review caught it by reasoning and it is exactly the class of error a
 * screenshot on a release build is for.
 *
 * ## What is arriving, and what it is not
 *
 * The rule draws from its centre out (`StretchInX`, one shot) and the label and
 * the foot fade in behind it. That is the whole of the motion, and 200ms is
 * deliberate rather than slack: the app's press vocabulary is 150ms because it
 * is met tens of times a day, while a cold boot is met once, which is the tier
 * this system reserves its budget for. There is still no spinner, no bar and no
 * loop, because a loop is a claim about progress and this app has no progress to
 * report — `restoreSession` is one request. A line that says what is late is
 * doing the whole job.
 *
 * Reduced motion is not branched here, and that is not an omission:
 * Reanimated's layout-animation builders default their `reduceMotion` to
 * `ReduceMotion.System`, so the draw snaps and the fades stay (opacity is on the
 * keep list). `TripGate` relies on the same default for the same reason, and
 * `components/ui/motionClasses.ts` records why a gate would be a second opinion
 * on a question that is already answered.
 *
 * ## Never held open
 *
 * There is no minimum duration, and the draw gets cut off by a fast boot rather
 * than the other way round. Delaying the content to let an animation finish is
 * the trade this component exists to refuse.
 *
 * **Not `Screen`.** A `Screen` is a `ScrollView`, and a cover does not scroll:
 * "centred" would mean centred in the content rather than in the frame, and the
 * first frame would stop matching the splash.
 */

export function BootCover({ label }: { label: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-sand" aria-busy>
      {/*
        The mark, alone, centred in the window: this is the first frame, so
        nothing may share its centring box. See the arithmetic above for why the
        inset is here and why nothing else is.
      */}
      <View
        className="flex-1 items-center justify-center"
        style={{ paddingTop: insets.bottom }}
      >
        {/*
          The splash's own asset at its own declared width, and never animated:
          see above. `resizeMode` is left at the default, which is what the
          config plugin uses, so the two draws are the same draw.

          This is the one React Native `Image` left in the app, and it is not an
          oversight: every other photo is `expo-image` for its disk cache, and
          this one has nothing to cache — it is a bundled asset drawn once, on
          the first frame, where a decode pipeline that can fade or settle is a
          jump risk on the exact frame that must match the OS splash. It also
          carries `accessibilityIgnoresInvertColors`, which is a React Native
          `Image` prop: the mark is a dark tile on sand, and an inverted phone
          must not render it as a pale one.
        */}
        <Image
          source={require("@/assets/splash.png")}
          style={{ width: SPLASH_IMAGE_WIDTH, height: SPLASH_IMAGE_WIDTH }}
          accessibilityIgnoresInvertColors
        />
      </View>

      {/*
        The rule and the label, hung under the mark by arithmetic rather than by
        flow: `top: 50%` is the frame's centre, and the offset is half the mark
        plus the gap — plus half the inset, because they are positioned against
        the padded box while the mark is positioned against the window.

        They are their own layer rather than siblings of the mark for the reason
        above: a sibling would be inside the centring box, and the box centres
        what it holds, so the mark would move.
      */}
      <View
        className="absolute left-0 right-0"
        style={{
          top: "50%",
          marginTop: markOffset(insets.bottom),
        }}
      >
        <Column>
          <View className="gap-3">
            <Animated.View
              entering={StretchInX.duration(200).easing(EASE_MOTION)}
            >
              <PageRule />
            </Animated.View>
            <Animated.View entering={FadeIn.delay(120).duration(150)}>
              {/*
                The label is the app's own loading sentence, unchanged from the
                line this replaced — what is arriving, in the product's voice —
                and it is a polite live region so a screen-reader user is told
                something rather than hearing an empty page.
              */}
              <Text
                aria-live="polite"
                className="text-center font-body text-sm text-ink opacity-60"
              >
                {label}
              </Text>
            </Animated.View>
          </View>
        </Column>
      </View>

      {/*
        The page's foot: the band's own perforation at the other end of the
        screen, which is what makes the cover read as a page with an edge rather
        than as a centred logo on an empty ground. It arrives with the label
        because the first frame belongs to the splash, and it is pinned rather
        than flowed so that its height cannot move the mark.

        It sits at the bottom of the app's content box — the shell below it
        paints the gesture bar's inset in the same sand, which is where every
        other screen's foot sits too. On the web export the insets are zero and
        the strip is flush with the bottom of the window.
      */}
      <View className="absolute bottom-0 left-0 right-0">
        <Animated.View entering={FadeIn.delay(120).duration(150)}>
          <ScallopEdge direction="up" />
        </Animated.View>
      </View>
    </View>
  );
}
