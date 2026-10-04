import { Easing } from "react-native-reanimated";

import { EASE_MOTION_POINTS } from "@/components/ui/motionClasses";

/**
 * The one curve, as Reanimated wants it.
 *
 * Every class-based transition in the app gets the curve from `global.css`
 * (`ease-motion`), and this is the same curve for the one thing that cannot be
 * a class: an `entering` animation. `StretchInX.duration(200).easing(…)` takes
 * a function, and the alternative spelling — the string
 * `"cubic-bezier(0.23, 1, 0.32, 1)"` — is not merely unfashionable: Reanimated
 * 4.5 rejects a raw `cubic-bezier(...)` string in a style, and an `easing` prop
 * is not a place to find that out at runtime.
 *
 * The numbers live in `motionClasses.ts` and not here, because they are the
 * one thing the test must be able to read: `__tests__/motion.test.ts` holds the
 * CSS token in `global.css` to them, and it cannot import this file at all —
 * `react-native-reanimated` is Flow source that vitest, in plain node, cannot
 * parse. So this module is deliberately tiny: the hook-shaped import is the
 * whole of what it adds, and the value it is built from is elsewhere.
 *
 * Not exported as a `MotionRole`: the roles are the *class* vocabulary, met
 * tens of times a day at 150ms, and this serves a rare one-shot at 200ms. Two
 * different things that happen to share a curve.
 */
export const EASE_MOTION = Easing.bezier(...EASE_MOTION_POINTS);
