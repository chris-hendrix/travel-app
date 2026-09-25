/**
 * Which platform this bundle is running on.
 *
 * There is only one answer now. The native Android app is built from
 * `apps/mobile` (Expo + expo-router); this app is the frozen web surface
 * and the rollback target, so every caller of `isNative()` in here is on
 * the web branch. The two functions stay as the call sites' shape rather
 * than being deleted, because the branches they guard (native token
 * storage, Capacitor push, the hardware back button) either no longer
 * exist or were never reachable from a browser.
 */
export function isNative(): boolean {
  return false;
}

export function getPlatform(): "ios" | "android" | "web" {
  return "web";
}
