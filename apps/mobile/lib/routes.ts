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
 * Routes whose band carries the wordmark and nothing else.
 *
 * The landing is read before anyone has signed in, so a bell, an avatar
 * and a clock have nothing to say; and it is a front door rather than a
 * workspace, so it takes none of the app's chrome.
 */
export const BARE_HEADER_ROUTES = ["/"];
