import { useEffect, useState } from "react";
import TripsScreen from "./trips/index";
import { DEMO_AUTH_USER, buildDemoTrips } from "@/lib/demo";
import {
  createDemoStore,
  installDemoFetch,
  uninstallDemoFetch,
} from "@/lib/demo/adapter";
import { installDemoEarly } from "@/lib/demo/installEarly";
import { setDemoAuthUser } from "@/lib/authStore";

/**
 * The demo: the REAL trip list screen (`app/trips/index.tsx`) against
 * the demo data layer (`lib/demo/adapter.ts`), which serves the app's
 * own API endpoints from the fixture with in-memory writes — fully
 * offline. Tapping a trip pushes the real detail route
 * (`/trips/detail?id=…`), whose sheets submit through the adapter and
 * repaint on invalidation, exactly like production.
 *
 * Two mount-scoped installs make the real screens resolve:
 * - the fetch interceptor, so every read/write the screens fire is
 *   answered locally and recorded (never the network);
 * - the demo session, so `useAuth().user` is the fixture's traveler
 *   and `canReadRun` opens the run.
 *
 * Ordering matters: both install synchronously in the state
 * initializer, which runs during this component's first render —
 * before `TripsScreen`'s suspense queries fire. The effect only owns
 * the unmount cleanup. Both are reverted together, so leaving `/demo`
 * restores the real session and the real fetch.
 *
 * Dead ends (handled, not silent): anything the visitor can reach
 * that the demo does not implement — the Create-trip CTA's `/trips/new`
 * submit, invite/people management, cover uploads, notifications,
 * profile, admin — replaces to `/login` through the demo allowlist
 * (`lib/demo/guard.ts` + `components/demo/DemoGuard.tsx`), which is the
 * honest answer and the conversion moment. The place picker is served:
 * the adapter answers autocomplete + details from an invented list.
 */
export default function Demo() {
  useState(() => {
    // The early install (`lib/demo/installEarly.ts`, via `app/_layout.tsx`)
    // already installed before the shell rendered; re-call it here so a
    // direct mount without the layout path still resolves, then install
    // idempotently as before.
    installDemoEarly();
    installDemoFetch(createDemoStore(buildDemoTrips(new Date())));
    setDemoAuthUser({ ...DEMO_AUTH_USER });
    return null;
  });
  useEffect(
    () => () => {
      uninstallDemoFetch();
      setDemoAuthUser(null);
    },
    [],
  );
  return <TripsScreen />;
}
