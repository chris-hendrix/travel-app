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
  "/trips/members",
  "/trips/invite",
  "/trips/settings",
  "/trips/edit",
  "/trips/events/new",
  "/trips/events/edit",
  "/trips/events/detail",
  "/trips/new",
  "/trips/travel",
  "/trips/travel/form",
  "/trips/stay/new",
  "/trips/stay/detail",
  "/trips/stay/edit",
  "/legal/terms",
  "/legal/privacy",
  "/legal/sms-terms",
  // Published aliases for the outside world (Twilio registration, shared
  // copy): same FullscreenDialog screens as their /legal/* twins, so they
  // need the same suppressed wordmark bar.
  "/terms",
  "/privacy",
  "/sms-terms",
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
