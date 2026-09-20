/**
 * Route lists that the root layout needs to know about. Screens are
 * otherwise self-describing, so keep anything layout-aware here rather
 * than inline in _layout.
 */

/**
 * Fullscreen dialogs render their own title-mode header, so the global
 * wordmark bar stays off these routes. Add every new dialog route.
 */
export const DIALOG_ROUTES = [
  "/notifications",
  "/profile",
  "/design/profile",
  "/design/trips/members",
  "/design/trips/invite",
  "/design/trips/settings",
  "/design/trips/edit",
  "/design/trips/events/new",
  "/design/trips/events/edit",
  "/design/trips/events/detail",
  "/design/trips/new",
  "/design/trips/travel",
  "/design/trips/travel/form",
  "/design/trips/stay/new",
  "/design/trips/stay/detail",
  "/design/trips/stay/edit",
  "/design/legal/terms",
  "/design/legal/privacy",
  "/design/legal/sms-terms",
];

/**
 * Routes that take no person chrome, and which band they wear.
 *
 * The landing is read before anyone has signed in, so a bell, an avatar
 * and a clock have nothing to say to them: it keeps the wordmark and
 * the word for the way in. The three auth screens keep the wordmark
 * alone, because the way in is the screen itself.
 */
export const BARE_HEADER_ROUTES: Record<string, "landing" | "bare"> = {
  "/": "landing",
  "/login": "bare",
  "/verify": "bare",
  "/complete-profile": "bare",
  // The invitation is the only screen a stranger reaches first, and it
  // is deliberately not under /design: the link in the text points here,
  // so the address has to be one that survives the lab being deleted.
  "/invite": "bare",
};
