import { useEffect, useState } from "react";
import TripsScreen from "./trips/index";
import { DEMO_AUTH_USER, buildDemoTrips } from "@/lib/demo";
import {
  createDemoStore,
  installDemoFetch,
  uninstallDemoFetch,
} from "@/lib/demo/adapter";
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
 * Known limits (out of scope): the list's Create-trip CTA pushes the
 * real `/trips/new` authoring surface, which needs live Places plus a
 * real account — it dead-ends in the demo. Invite/people management
 * and cover uploads are not served and answer the API 404 envelope.
 */
export default function Demo() {
  useState(() => {
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
