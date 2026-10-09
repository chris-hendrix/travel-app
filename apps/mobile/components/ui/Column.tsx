import type { ReactNode } from "react";
import { View } from "react-native";

/**
 * The constrained column: everything the app reads, at a measure.
 *
 * On wide screens the content sits in a centred column: at 960px the inner
 * width is 864px, which is exactly two 420px cards plus the gap, so the grid
 * fills its column instead of leaving a ragged edge.
 *
 * This is `Screen.tsx`'s old inner `View`, **moved rather than copied**. It
 * had to move because a full-bleed `Band` cannot exist inside a constrained
 * column: `Screen` now renders its children straight into the scroll, and
 * every call site wraps its own content here. The vertical rhythm came with
 * it — `py-6 md:py-10` and the `lead` variant — because a `Column` that kept
 * the width and dropped the rhythm would have changed every screen.
 *
 * `lead` is for the screens that open on a display heading rather than on
 * content: the landing, the way in, and the invitation. They want air above
 * the first line that a list of rows does not, and the same 24px rhythm
 * between the blocks that the repeated wrapper carried before it. Before
 * this it was a magic `gap-6 pt-4 md:pt-14` wrapper repeated in four
 * screens, and the gap is load-bearing: without it the field, the consent
 * and the button stack with nothing between them.
 *
 * `roomy` is the landing's rhythm, and only the landing's — a marketing
 * page opens on display type and wants more air between its blocks than a
 * list of rows does. It exists because a seam has to *read* as a seam: at
 * 24px a block's bottom and the next block's top make 48, while the widest
 * gap **inside** a landing block is the shelf band's 40 — so on a phone
 * "That's it." sat 40px from the card and the card 48px from the heading
 * below it, and the page read as one undifferentiated stack. At 40 the
 * seam is 80 and clears the interior by 2×, which is the ratio the wide
 * layout already had.
 *
 * Note what `roomy` is *not*. The earlier attempt to give the shelf band
 * 40/64 **on its own** was reverted: measured against the page's 24/40, the
 * band had 2.6× the air around it and read as a card floating in teal. The
 * fault there was the local deviation, not the 40/64 — raising the whole
 * page moves every seam together and keeps the rhythm the eye follows.
 *
 * The rhythm is one of four, and a block takes one of them rather than a
 * padding of its own: two paddings on one seam put the page on a rhythm
 * nobody chose, which is what `design-lint.mjs` check 10 exists to stop.
 *
 * A band's content goes in one of these too, so a heading inside a band
 * lines up with the heading above it. The band is full bleed; the words are
 * not.
 */
const RHYTHM = {
  /** The working app. */
  default: "py-6 md:py-10",
  /** The landing. */
  roomy: "py-10 md:py-14",
  /** Opening on a display heading, at the working rhythm. */
  lead: "gap-6 pb-6 pt-10 md:pb-10 md:pt-24",
  /** Opening on a display heading, on the landing. */
  leadRoomy: "gap-6 pb-10 pt-10 md:pb-14 md:pt-24",
} as const;

function rhythmFor(lead: boolean, roomy: boolean): keyof typeof RHYTHM {
  if (lead) return roomy ? "leadRoomy" : "lead";
  return roomy ? "roomy" : "default";
}

export function Column({
  children,
  lead = false,
  roomy = false,
}: {
  children: ReactNode;
  /** Opens on a display heading: more air above, the page's own bottom. */
  lead?: boolean;
  /** The landing's rhythm. See the table above for why it deviates. */
  roomy?: boolean;
}) {
  return (
    <View
      className={`mx-auto w-full max-w-[960px] px-6 md:px-12 ${
        RHYTHM[rhythmFor(lead, roomy)]
      }`}
    >
      {children}
    </View>
  );
}
