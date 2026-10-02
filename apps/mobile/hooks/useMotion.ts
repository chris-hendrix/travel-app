import { useReducedMotion } from "react-native-reanimated";

import { MOTION, REDUCED_MOTION, type MotionRole } from "@/components/ui/motionClasses";

/**
 * The motion classes for this device, in one call.
 *
 * The five roles and the methodology behind them are in
 * `components/ui/motionClasses.ts`, which is where the reasoning lives and
 * where a sixth role gets added. This file is only the switch between the
 * two maps — the *why* of the switch is the long part of that comment, and
 * the short version is that a media query cannot answer the question on
 * Android and this can.
 *
 * Returns one of two module objects rather than building a new one, so a
 * component that reads this does not allocate on every render. `press` and
 * `pressFill` are the only roles whose reduced form differs in what it
 * does; `row` and `state` are colour and are kept; `disclosure` is a turn
 * and goes.
 */
export function useMotion(): Record<MotionRole, string> {
  return useReducedMotion() ? REDUCED_MOTION : MOTION;
}
