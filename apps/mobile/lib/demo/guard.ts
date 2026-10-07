/**
 * The demo's allowlist: where a demo visitor may stand.
 *
 * `/demo?id=…` renders the REAL trip detail screen
 * (`app/trips/detail.tsx`) against the demo data layer, plus the
 * member/travel/stay/event sheets the traveler can reach from it — the
 * stack keeps `/demo` mounted underneath, so the adapter and the fixture
 * traveler stay installed while the visitor walks. Anything the visitor
 * can reach that the demo does not actually implement must end at
 * `/login`, which is the
 * honest answer ("this part needs a real account") and the conversion
 * moment the surface exists for.
 *
 * Two lists, one rule, read against the real navigation graph (every
 * `router.push` the demo's own screens can fire as the fixture's
 * traveler, who is never the organizer):
 *
 * - `DEMO_APP_ROUTES`: the demo scope. The invite entry plus every
 *   trips route whose reads AND writes the adapter serves: detail,
 *   members + member detail (traveler rows are plain views), the
 *   travel board + travel detail + travel form (`POST /member-travel`
 *   is served, and "Add travel" is a real working submit), the event
 *   and stay detail dialogs (traveler gets "Done", served reads), and
 *   trip settings (the "Trip settings" row serves `my-settings` plus
 *   the notification pair). `/trips/travel/form` and `/trips/settings`
 *   are NOT in the operator's minimum set but belong here: both are
 *   reachable from screens the demo renders and both are fully served,
 *   so bouncing the visitor out of them would be a dead end of our own
 *   making rather than an honest absent surface.
 * - `DEMO_PUBLIC_ROUTES`: pages that must never bounce — the landing,
 *   the auth flow, the invite preview, the legal pages, the not-found
 *   route. A demo visitor who lands here is simply out of the demo
 *   scope, not lost: the demo session is torn down and the page
 *   renders signed-out, exactly like a stranger's visit.
 *
 * Deliberately OUT (genuinely absent — the trip list, creating a trip,
 * inviting people, notifications, profile, admin, authoring as an
 * organizer): `/trips`, `/trips/new`, `/trips/edit`, `/trips/invite`, `/trips/members/new`,
 * `/trips/events/new`, `/trips/events/edit`, `/trips/stay/new`,
 * `/trips/stay/edit`, `/notifications`, `/profile`, `/admin/users`,
 * `/admin/users/detail`, `/design/*`. The traveler never sees a door
 * to the organizer-only ones (no Invite button, no Add/Edit rows), so
 * reaching them takes a hand-typed URL — and the answer is `/login`.
 *
 * Scope: the guard (`components/demo/DemoGuard.tsx`) only ever acts
 * while the demo session is installed (`getDemoAuthUser() !== null`),
 * which nothing outside `/demo` sets. A signed-in visitor on a real
 * trip never has a demo session, so they can never match this rule.
 * The one exception is `shouldReenterDemo` (browser-back into a demo
 * sheet URL after teardown), which re-enters through the entry rather
 * than touching any session.
 */

import { DEMO_TRIP_ID } from "@/lib/demo";

/** The demo scope: `/demo` plus every trips route the adapter serves. */
export const DEMO_APP_ROUTES: readonly string[] = [
  "/demo",
  "/trips/detail",
  "/trips/events/detail",
  "/trips/stay/detail",
  "/trips/members",
  "/trips/members/detail",
  "/trips/travel",
  "/trips/travel/detail",
  "/trips/travel/form",
  "/trips/settings",
];

/** Public pages: never bounced, and they end the demo scope. */
export const DEMO_PUBLIC_ROUTES: readonly string[] = [
  "/",
  "/login",
  "/verify",
  "/complete-profile",
  "/invite",
  "/privacy",
  "/terms",
  "/sms-terms",
  "/+not-found",
];

/** `usePathname` values compared without a trailing slash (`/demo/` reads as `/demo`). */
export function normalizeDemoPath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/** Inside the demo scope: the adapter serves this route, so stay. */
export function isDemoAppRoute(pathname: string): boolean {
  return DEMO_APP_ROUTES.includes(normalizeDemoPath(pathname));
}

/** A public page: never bounced (it ends the demo scope instead). */
export function isDemoPublicRoute(pathname: string): boolean {
  return DEMO_PUBLIC_ROUTES.includes(normalizeDemoPath(pathname));
}

/** Either of the two lists above: no redirect for a demo visitor. */
/**
 * Re-entry: browser-back into a demo sheet URL after leaving the demo.
 *
 * Leaving tears the demo scope down (fetch restored, session cleared)
 * while `/demo` stays mounted-but-hidden on web, and the sheet URL
 * itself carries no install — so nothing would reinstall and the
 * sheet would fire real reads with no session. The answer is the
 * entry: `/demo?id=…`, whose render reinstalls (`ensureDemoScope`).
 * `/demo` itself is excluded (its own render installs), and the `id`
 * match is exact so a real trip's sheet never bounces.
 */
export function shouldReenterDemo(
  pathname: string,
  id: unknown,
): boolean {
  const single = Array.isArray(id) ? id[0] : id;
  if (single !== DEMO_TRIP_ID) return false;
  const path = normalizeDemoPath(pathname);
  if (path === "/demo") return false;
  return (DEMO_APP_ROUTES as readonly string[]).includes(path);
}
export function isDemoAllowedRoute(pathname: string): boolean {
  const path = normalizeDemoPath(pathname);
  return DEMO_APP_ROUTES.includes(path) || DEMO_PUBLIC_ROUTES.includes(path);
}
