import { useEffect } from "react";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import {
  buildDemoStore,
  installDemoFetch,
  isDemoFetchInstalled,
  uninstallDemoFetch,
} from "@/lib/demo/adapter";
import { DEMO_AUTH_USER } from "@/lib/demo";
import { getDemoAuthUser, setDemoAuthUser } from "@/lib/authStore";
import {
  demoIdFrom,
  isDemoAllowedRoute,
  isDemoAppRoute,
  normalizeDemoPath,
  shouldReenterDemo,
} from "@/lib/demo/guard";

/**
 * Tear down the demo scope: the real fetch and the real (absent)
 * session come back. Run before leaving the demo, so the page that
 * follows always renders the way a stranger's visit would.
 */
export function teardownDemoScope(): void {
  uninstallDemoFetch();
  setDemoAuthUser(null);
}

/**
 * Reinstall the demo scope when it is missing: the fetch interceptor
 * plus the fixture session, the same pair `app/demo.tsx` mounts.
 * A no-op when the scope is already installed, so in-demo walks keep
 * their in-memory writes.
 *
 * Why this exists alongside the entry's mount installs: on web the
 * stack keeps `/demo` mounted while hidden (a hidden screen is a
 * `display: none` view, not an unmount), so browser-back tears the
 * scope down through this guard's pathname effect WITHOUT unmounting
 * the entry — and browser-forward back to `/demo` remounts nothing.
 * No mount install re-runs, so nothing would reinstall and the real
 * trip screen would fire genuine requests. The guard renders above
 * the stack (see `app/_layout.tsx`), so reinstalling here — during
 * render, before the trip screen's queries fire — puts the offline
 * data layer back before any read can reach the network.
 */
export function ensureDemoScope(): void {
  if (isDemoFetchInstalled() && getDemoAuthUser() !== null) return;
  installDemoFetch(buildDemoStore(new Date()));
  setDemoAuthUser({ ...DEMO_AUTH_USER });
}

/**
 * The demo's dead ends go to `/login`.
 *
 * While the demo session is installed (only ever under `/demo`), a
 * route the demo does not serve — the create form, the invite flow,
 * notifications, profile, admin, the organizer-only authoring screens
 * — replaces to `/login`: the honest answer ("this part needs a real
 * account"). The demo scope itself (`isDemoAppRoute`) and the public
 * pages (`isDemoAllowedRoute`) never bounce; landing on a public page
 * instead ends the demo scope quietly, so `/login` renders signed-out
 * rather than bouncing off the fixture traveler.
 *
 * Scoping: without a demo session the guard only ever re-enters a
 * demo sheet URL through `/demo` (browser-back after teardown) — a
 * signed-in visitor on a real trip never carries the demo trip id, so
 * the guard cannot fire for them, full stop.
 */
export function DemoGuard(): null {
  const pathname = usePathname();
  const router = useRouter();
  const params = useGlobalSearchParams();
  // Standing on the entry implies the scope — mount or no mount.
  // Render-phase (not the effect below): the stack's screens render
  // after this guard, so the interceptor is back before any query
  // the re-entered trip screen fires. A no-op while installed, so
  // in-demo walks keep their in-memory writes.
  if (normalizeDemoPath(pathname) === "/demo") ensureDemoScope();
  useEffect(() => {
    // No demo session: the real app is untouched — except re-entry.
    // Browser-back into a demo sheet URL after leaving tore the
    // scope down while `/demo` stayed mounted-but-hidden, so the
    // sheet would fire real reads with no session. Walk back through
    // the entry, whose render (`ensureDemoScope` above) reinstalls,
    // instead.
    if (getDemoAuthUser() === null) {
      // Back into a demo sheet URL: walk through the entry carrying
      // the visitor's OWN trip, so a browser-back into the bachelor
      // party's sheet reopens the bachelor party rather than the beach
      // trip.
      const demoId = demoIdFrom(params.id);
      if (demoId && shouldReenterDemo(pathname, demoId)) {
        router.replace(`/demo?id=${demoId}`);
      }
      return;
    }
    // Served by the adapter: the visitor stays in the demo.
    if (isDemoAppRoute(pathname)) return;
    // Out of the demo scope either way: what follows is a stranger's
    // page, not the fixture traveler's.
    teardownDemoScope();
    // Public pages render as themselves; anything else is a surface
    // the demo does not implement, and that answer is `/login`.
    if (!isDemoAllowedRoute(pathname)) router.replace("/login");
  }, [pathname, params.id, router]);
  return null;
}
