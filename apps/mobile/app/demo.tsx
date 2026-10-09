import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import TripDetail from "./trips/detail";
import { DEMO_AUTH_USER, demoCoverKind } from "@/lib/demo";
import {
  buildDemoStore,
  installDemoFetch,
  uninstallDemoFetch,
} from "@/lib/demo/adapter";
import { installDemoEarly } from "@/lib/demo/installEarly";
import { setDemoAuthUser } from "@/lib/authStore";

/**
 * The demo: the REAL trip detail screen (`app/trips/detail.tsx`)
 * against the demo data layer (`lib/demo/adapter.ts`), which serves
 * the trip's reads from the fixture with in-memory writes — fully
 * offline. The entry URL carries a demo trip id
 * (`/demo?id=demo-trip-cabo`, one of the three cards on the landing);
 * the screen reads it through the real `useLocalSearchParams`,
 * exactly like production, and the store holds all three trips, so
 * whichever card the visitor pressed opens its own trip.
 *
 * The funnel, kept deliberately: the landing already showed the three
 * trips as cards, so the demo skips straight to the payoff — the trip
 * it opens. There is no accept beat any more: in the product,
 * accepting an invitation IS signing in, and the demo has no phone
 * number, so the card's press is the click that opens the trip.
 * Nothing here duplicates the detail screen's markup; this stays a
 * thin wrapper because the installs are the whole of what the real
 * screen needs to resolve offline.
 *
 * Two mount-scoped installs make the real screen resolve:
 * - the fetch interceptor, so every read/write the screen fires is
 *   answered locally and recorded (never the network);
 * - the demo session, so `useAuth().user` is the fixture's traveler
 *   and the screen reads as one of the going members.
 *
 * Ordering matters: both install synchronously in the state
 * initializer, which runs during this component's first render —
 * before the detail screen's queries fire. The effect only owns the
 * unmount cleanup. Both are reverted together, so leaving `/demo`
 * restores the real session and the real fetch.
 *
 * Dead ends (handled, not silent): anything the visitor can reach
 * that the demo does not implement — creating a trip, inviting
 * people, notifications, profile, admin, organizer authoring — replaces
 * to `/login` through the demo allowlist (`lib/demo/guard.ts` +
 * `components/demo/DemoGuard.tsx`), which is the honest answer and the
 * conversion moment. The place picker is served: the adapter answers
 * autocomplete + details from an invented list. The trip list is gone,
 * so there is no list to fall back to either.
 */
export default function Demo() {
  // The trip id decides which occasion photo the hero falls back to
  // (`demoCoverKind`), which is the one thing this wrapper adds to the
  // real screen. It is read here, in the demo's own file, rather than
  // inside `app/trips/detail.tsx`, so the product screen stays free of
  // demo data and only carries the optional prop — exactly the seam
  // `TripCard`'s `coverKind` already is.
  const { id } = useLocalSearchParams<{ id?: string }>();
  const coverKind = demoCoverKind(typeof id === "string" ? id : "") ?? "trip";

  useState(() => {
    // The early install (`lib/demo/installEarly.ts`, via `app/_layout.tsx`)
    // already installed before the shell rendered; re-call it here so a
    // direct mount without the layout path still resolves, then install
    // idempotently as before.
    installDemoEarly();
    installDemoFetch(buildDemoStore(new Date()));
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
  return <TripDetail coverKind={coverKind} />;
}
