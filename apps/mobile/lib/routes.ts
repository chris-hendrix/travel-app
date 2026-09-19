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
  "/design/trips/settings",
  "/design/trips/edit",
  "/design/trips/events/new",
  "/design/trips/events/edit",
  "/design/trips/events/detail",
  "/design/trips/new",
];
