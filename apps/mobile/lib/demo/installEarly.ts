/**
 * The demo's early install: the same fetch interceptor and demo session
 * `app/demo.tsx` mounts, but evaluated at module scope — before the root
 * layout's shell renders and before its `GET /auth/me` restore fires.
 *
 * Guarded to the demo route only: on web the path comes from
 * `window.location.pathname` and only `/demo` or `/demo/…` installs.
 * On native there is no such path, so nothing installs (the demo is a
 * web-export surface). Idempotent: a second call is a no-op — the store
 * is created once and `installDemoFetch` already keeps the first wrap.
 * `app/demo.tsx` keeps its own install plus its unmount cleanup, which
 * calls the same helper.
 */

import { DEMO_AUTH_USER, buildDemoTrips } from "@/lib/demo";
import { createDemoStore, installDemoFetch } from "@/lib/demo/adapter";
import { setDemoAuthUser } from "@/lib/authStore";

let installed = false;

export function isDemoPath(pathname: string): boolean {
  return pathname === "/demo" || pathname.startsWith("/demo/");
}

export function currentPathname(): string | null {
  const location =
    typeof window !== "undefined"
      ? (window as { location?: { pathname?: unknown } }).location
      : undefined;
  const pathname = location?.pathname;
  return typeof pathname === "string" ? pathname : null;
}

export function installDemoEarly(): boolean {
  if (installed) return true;
  const pathname = currentPathname();
  if (pathname === null || !isDemoPath(pathname)) return false;
  installDemoFetch(createDemoStore(buildDemoTrips(new Date())));
  setDemoAuthUser({ ...DEMO_AUTH_USER });
  installed = true;
  return true;
}

/** Test-only reset: the module's once-flag, so suites can reinstall. */
export function resetDemoEarlyForTests(): void {
  installed = false;
}

installDemoEarly();
