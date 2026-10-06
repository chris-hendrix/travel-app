/**
 * Route lists that the root layout needs to know about. Screens are
 * otherwise self-describing, so keep anything layout-aware here rather
 * than inline in _layout.
 */

/**
 * Fullscreen dialogs render their own title-mode header, so the global
 * wordmark bar stays off these routes. Add every new dialog route.
 *
 * The admin user list is deliberately NOT here: it is a browse surface
 * and wears the page chrome, like `/trips`. Its record is a dialog.
 */
export const DIALOG_ROUTES = [
  "/notifications",
  "/profile",
  "/admin/users/detail",
  "/trips/members",
  "/trips/members/new",
  "/trips/members/detail",
  "/trips/invite",
  "/trips/settings",
  "/trips/edit",
  "/trips/events/new",
  "/trips/events/edit",
  "/trips/events/detail",
  "/trips/new",
  "/trips/travel",
  "/trips/travel/detail",
  "/trips/travel/form",
  "/trips/stay/new",
  "/trips/stay/detail",
  "/trips/stay/edit",
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
  // "/demo" is deliberately absent: the demo installs its traveler
  // session before the shell paints (`lib/demo/installEarly.ts`), so it
  // wears the app header — bell plus avatar — never the landing's
  // sign-in word. A signed-out word above a signed-in list is the boot
  // race this map used to encode; see `app/demo.tsx`.
  // (no /demo entry: app chrome, not bare)
  "/login": "bare",
  "/verify": "bare",
  "/complete-profile": "bare",
  // The invitation is the only screen a stranger reaches first, and it
  // is deliberately not under /design: the link in the text points here,
  // so the address has to be one that survives the lab being deleted.
  "/invite": "bare",
};
