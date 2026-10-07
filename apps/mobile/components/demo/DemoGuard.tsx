import { useEffect } from "react";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { uninstallDemoFetch } from "@/lib/demo/adapter";
import { DEMO_TRIP_ID } from "@/lib/demo";
import { getDemoAuthUser, setDemoAuthUser } from "@/lib/authStore";
import {
  isDemoAllowedRoute,
  isDemoAppRoute,
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
  useEffect(() => {
    // No demo session: the real app is untouched — except re-entry.
    // Browser-back into a demo sheet URL after leaving tore the
    // scope down with `/demo` unmounted, so nothing would reinstall
    // and the sheet would fire real reads with no session. Walk back
    // through the entry, whose mount reinstalls, instead.
    if (getDemoAuthUser() === null) {
      if (shouldReenterDemo(pathname, params.id)) {
        router.replace(`/demo?id=${DEMO_TRIP_ID}`);
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
