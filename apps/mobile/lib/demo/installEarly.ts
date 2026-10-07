/**
 * The demo's early install: the same fetch interceptor and demo session
 * `app/demo.tsx` mounts, but evaluated at module scope — before the root
 * layout's shell renders and before its `GET /auth/me` restore fires.
 *
 * Guarded to the demo URLs only: on web the location's pathname installs
 * for `/demo` or `/demo/…`, and for the demo trip's detail URL carrying
 * the demo trip id in the query (`/trips/detail?id=demo-trip-cabo`) —
 * which is the Accept button's target, and the URL a refresh lands on.
 * The trip match is scoped to the demo trip id on purpose: a real trip's
 * deep link must never install the fixture. On native there is no such
 * location, so nothing installs (the demo is a web-export surface).
 * Idempotent: a second call is a no-op — the store is created once and
 * `installDemoFetch` already keeps the first wrap. `app/demo.tsx` keeps
 * its own install plus its unmount cleanup, which calls the same helper.
 */

import {
  DEMO_AUTH_USER,
  DEMO_TRIP_ID,
  buildDemoTrip,
} from "@/lib/demo";
import { createDemoStore, installDemoFetch } from "@/lib/demo/adapter";
import { setDemoAuthUser } from "@/lib/authStore";

let installed = false;

export function isDemoPath(pathname: string, search = ""): boolean {
  if (pathname === "/demo" || pathname.startsWith("/demo/")) return true;
  // A refresh on the Accept button's target: the query carries the demo
  // trip id (`useLocalSearchParams` reads `?id=`), and only that id
  // installs — any other trip id is somebody's real deep link.
  if (pathname === "/trips/detail" && search.includes(DEMO_TRIP_ID)) {
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
  if (installed) return true;
  const pathname = currentPathname();
  if (pathname === null || !isDemoPath(pathname, currentSearch())) {
    return false;
  }
  installDemoFetch(createDemoStore([buildDemoTrip(new Date())]));
  setDemoAuthUser({ ...DEMO_AUTH_USER });
  installed = true;
  return true;
}

/** Test-only reset: the module's once-flag, so suites can reinstall. */
export function resetDemoEarlyForTests(): void {
  installed = false;
}

installDemoEarly();
