/**
 * The demo's early install: the same fetch interceptor and demo session
 * `app/demo.tsx` mounts, but evaluated at module scope — before the root
 * layout's shell renders and before its `GET /auth/me` restore fires.
 *
 * Guarded to the demo URLs only: on web the location's pathname installs
 * for `/demo` or `/demo/…` (the entry, which renders the real trip detail
 * against the fixture), and for every other demo route carrying the demo
 * trip id in the query (`/trips/detail?id=demo-trip-cabo`, the members /
 * travel / stay / event sheets and settings the trip screen pushes to) —
 * whichever of those a refresh lands on. The trip match is scoped to the
 * demo trip id on purpose: a real trip's deep link must never install the
 * fixture. On native there is no such location, so nothing installs (the
 * demo is a web-export surface). Idempotent: a second call is a no-op —
 * the store is created once and `installDemoFetch` already keeps the first
 * wrap. `app/demo.tsx` keeps its own install plus its unmount cleanup,
 * which calls the same helper.
 */

import {
  DEMO_AUTH_USER,
  DEMO_TRIP_ID,
  buildDemoTrip,
} from "@/lib/demo";
import { createDemoStore, installDemoFetch, isDemoFetchInstalled, uninstallDemoFetch } from "@/lib/demo/adapter";
import { DEMO_APP_ROUTES, normalizeDemoPath } from "@/lib/demo/guard";
import { setDemoAuthUser } from "@/lib/authStore";

export function isDemoPath(pathname: string, search = ""): boolean {
  if (pathname === "/demo" || pathname.startsWith("/demo/")) return true;
  // A refresh on any demo route past the entry: every screen the trip
  // pushes to carries the trip id in the query (`useLocalSearchParams`
  // reads `?id=`), and only the demo trip id installs — any other trip
  // id is somebody's real deep link. The match is exact on the `id`
  // param, not a substring: `?id=demo-trip-cabo-evil` or a stray
  // `?foo=demo-trip-cabo` must never install the fixture.
  const demoId = new URLSearchParams(search).get("id");
  if (
    demoId === DEMO_TRIP_ID &&
    (DEMO_APP_ROUTES as readonly string[]).includes(
      normalizeDemoPath(pathname),
    )
  ) {
    return true;
  }
  return false;
}

export function currentPathname(): string | null {
  const location =
    typeof window !== "undefined"
      ? (window as { location?: { pathname?: unknown } }).location
      : undefined;
  const pathname = location?.pathname;
  return typeof pathname === "string" ? pathname : null;
}

export function currentSearch(): string {
  const location =
    typeof window !== "undefined"
      ? (window as { location?: { search?: unknown } }).location
      : undefined;
  const search = location?.search;
  return typeof search === "string" ? search : "";
}

export function installDemoEarly(): boolean {
  // Already installed (the adapter's own wrap is the record, not a
  // sticky module flag — leaving the demo tears the wrap down, so
  // the next call on a demo URL genuinely reinstalls): a no-op that
  // reports as installed. The store is deliberately NOT refreshed
  // here — the mounted entry owns its store through its own
  // `installDemoFetch` call.
  if (isDemoFetchInstalled()) return true;
  const pathname = currentPathname();
  if (pathname === null || !isDemoPath(pathname, currentSearch())) {
    return false;
  }
  installDemoFetch(createDemoStore([buildDemoTrip(new Date())]));
  setDemoAuthUser({ ...DEMO_AUTH_USER });
  return true;
}

/**
 * Test-only reset: uninstalls the demo fetch wrap, so suites can
 * reinstall from clean. (There is no module once-flag any more:
 * installed-ness is the adapter's own wrap — see above.)
 */
export function resetDemoEarlyForTests(): void {
  uninstallDemoFetch();
}

installDemoEarly();
