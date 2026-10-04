/**
 * The one number the splash and the boot cover both draw the mark at, and the
 * one measurement that puts it in the same place.
 *
 * `app.json`'s `expo-splash-screen.imageWidth` is where the system draws the
 * mark before any of this app's code runs, and `BootCover` draws the same asset
 * at the same width for the few hundred milliseconds after it — so that the hand
 * on the launch is doing one thing rather than two.
 *
 * It has to be the same number, and on Android it has to be *exactly* the same,
 * because there is no crossfade to hide a difference: `setOptions`' `fade` is
 * iOS-only, so the splash is replaced by the first JS frame in one frame. A mark
 * that is 100pt on sand and then 96pt on sand is a visible jump on every single
 * launch, and every launch is the first thing anybody sees.
 *
 * Declared here rather than as a literal in both places because this is the one
 * value a reader would otherwise have to hold in their head while editing two
 * files in two languages. `__tests__/boot-cover.test.ts` fails if the two drift,
 * which is the part that makes it a contract instead of a comment.
 *
 * A plain module, not a constant in `BootCover.tsx`: the mobile suite is plain
 * node with no renderer (A9), so a value import of a component file pulls in
 * `react-native`'s Flow source and cannot be parsed. The fourth file in this
 * system to be split for that reason, and for the fourth time it is also the
 * right place for the reasoning.
 */
export const SPLASH_IMAGE_WIDTH = 100;

/**
 * The daylight between the mark's bottom edge and the rule that draws under it.
 *
 * Not a spacing token, and deliberately not one of the scale's: this is the gap
 * between two things the app did not both draw — the mark is the splash's, the
 * rule is ours — so it is a measurement of the cover rather than a step in the
 * page's rhythm.
 */
export const MARK_GAP = 24;

/**
 * How far below the frame's centre the rule hangs.
 *
 * The mark is centred in the **window** (that is where the splash puts it), and
 * the rule sits a fixed distance under the mark's bottom edge — so it cannot be
 * a constant: it moves by half the inset, because the layer it is positioned in
 * is the shell's content box rather than the window, and the shell reserves
 * `insets.bottom` for the gesture bar on every route.
 *
 * This is a function rather than an expression inside the component for the
 * reason this module exists: the position is the *whole* of "the first frame is
 * the splash", and the first version of that component got it wrong by centring
 * the mark as one group with the rule and the label. Here it can be asserted
 * without a renderer, which is the only way this suite can hold a layout claim.
 */
export function markOffset(insetsBottom: number): number {
  return SPLASH_IMAGE_WIDTH / 2 + MARK_GAP + insetsBottom / 2;
}
