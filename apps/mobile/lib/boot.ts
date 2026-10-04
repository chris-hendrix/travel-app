/**
 * The one number the splash and the boot cover both draw the mark at.
 *
 * `app.json`'s `expo-splash-screen.imageWidth` is where the system draws the
 * mark before any of this app's code runs, and `BootCover` draws the same
 * asset at the same width for the few hundred milliseconds after it — so that
 * the hand on the launch is doing one thing rather than two.
 *
 * It has to be the same number, and on Android it has to be *exactly* the same,
 * because there is no crossfade to hide a difference: `setOptions`' `fade` is
 * iOS-only, so the splash is replaced by the first JS frame in one frame. A
 * mark that is 100pt on sand and then 96pt on sand is a visible jump on every
 * single launch, and every launch is the first thing anybody sees.
 *
 * Declared here rather than as a literal in both places because this is the
 * one value a reader would otherwise have to hold in their head while editing
 * two files in two languages. `__tests__/boot-cover.test.ts` fails if the two
 * drift, which is the part that makes it a contract instead of a comment.
 *
 * A plain module, not a constant in `BootCover.tsx`: the mobile suite is plain
 * node with no renderer (A9), so a value import of a component file pulls in
 * `react-native`'s Flow source and cannot be parsed. The fourth file in this
 * system to be split for that reason, and for the fourth time it is also the
 * right place for the reasoning.
 */
export const SPLASH_IMAGE_WIDTH = 100;
