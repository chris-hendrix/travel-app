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
 * A band's content goes in one of these too, so a heading inside a band
 * lines up with the heading above it. The band is full bleed; the words are
 * not.
 *
 * `flush` drops the vertical rhythm and nothing else — the width, the
 * measure and the horizontal padding all stay. It is for the one shape
 * where the rhythm is the wrong answer: **a band whose height is its
 * content's**, where the thing inside is taller than the words and the
 * band should end exactly where that thing does. The landing's shelf is
 * that shape — a `baltic` band fitted to the height of the demo trip card
 * beside its mechanism row — and the rhythm above and below the card was
 * what made the band read as a section the card happened to sit in
 * instead of as the card's own ground. Not a general-purpose prop: if a
 * second screen wants it, the prop earns its name there too, and until
 * then it has exactly one caller.
 */
export function Column({
  children,
  lead = false,
  flush = false,
}: {
  children: ReactNode;
  lead?: boolean;
  /** Drop the vertical rhythm: for a band whose height is its content's. */
  flush?: boolean;
}) {
  return (
    <View
      className={
        `mx-auto w-full max-w-[960px] px-6 md:px-12` +
        (flush
          ? ""
          : lead
            ? " gap-6 pb-6 pt-10 md:pb-10 md:pt-24"
            : " py-6 md:py-10")
      }
    >
      {children}
    </View>
  );
}
