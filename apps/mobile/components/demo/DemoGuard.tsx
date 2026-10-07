import { useEffect } from "react";
import { usePathname, useRouter } from "expo-router";
import { uninstallDemoFetch } from "@/lib/demo/adapter";
import { getDemoAuthUser, setDemoAuthUser } from "@/lib/authStore";
import { isDemoAllowedRoute, isDemoAppRoute } from "@/lib/demo/guard";

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
 * Scoping: the first line returns for everyone without a demo
 * session, which is every signed-in visitor on a real trip — the
 * guard cannot fire for them, full stop.
 */
export function DemoGuard(): null {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    // No demo session, no demo rule: the real app is untouched.
    if (getDemoAuthUser() === null) return;
    // Served by the adapter: the visitor stays in the demo.
    if (isDemoAppRoute(pathname)) return;
    // Out of the demo scope either way: what follows is a stranger's
    // page, not the fixture traveler's.
    teardownDemoScope();
    // Public pages render as themselves; anything else is a surface
    // the demo does not implement, and that answer is `/login`.
    if (!isDemoAllowedRoute(pathname)) router.replace("/login");
  }, [pathname, router]);
  return null;
}
