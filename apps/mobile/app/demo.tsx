import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Invite from "./invite";
import { Column } from "@/components/ui/Column";
import {
  DEMO_AUTH_USER,
  DEMO_INVITER_NAME,
  buildDemoTrip,
} from "@/lib/demo";
import {
  createDemoStore,
  installDemoFetch,
  uninstallDemoFetch,
} from "@/lib/demo/adapter";
import { installDemoEarly } from "@/lib/demo/installEarly";
import { setDemoAuthUser } from "@/lib/authStore";

/**
 * The demo: the REAL invite screen (`app/invite.tsx`) against the demo
 * data layer (`lib/demo/adapter.ts`), which serves the invitation
 * preview and the trip's reads from the fixture with in-memory writes —
 * fully offline. The entry URL carries the demo invitation id
 * (`/demo?id=…`, linked from the landing); the screen reads it through
 * the real `useLocalSearchParams`, exactly like production.
 *
 * The single divergence from the product, owned here so `app/invite.tsx`
 * stays untouched for real visitors: the quiet line above the card
 * carries the "it arrives as a text" story without fabricating a
 * phone's message UI. And the honest funnel note: in the product,
 * accepting an invitation IS signing in (`app/invite.tsx` says so) —
 * the demo has no phone number, so the button opens the trip.
 *
 * Two mount-scoped installs make the real screen resolve:
 * - the fetch interceptor, so every read/write the screen fires is
 *   answered locally and recorded (never the network);
 * - the demo session, so `useAuth().user` is the fixture's traveler
 *   and the signed-in "Go to the trip" button is the one that renders.
 *
 * Ordering matters: both install synchronously in the state
 * initializer, which runs during this component's first render —
 * before the invite screen's preview query fires. The effect only owns
 * the unmount cleanup. Both are reverted together, so leaving `/demo`
 * restores the real session and the real fetch.
 *
 * Dead ends (handled, not silent): anything the visitor can reach
 * that the demo does not implement — invite/people management, cover
 * uploads, notifications, profile, admin — replaces to `/login`
 * through the demo allowlist (`lib/demo/guard.ts` +
 * `components/demo/DemoGuard.tsx`), which is the honest answer and the
 * conversion moment. The place picker is served: the adapter answers
 * autocomplete + details from an invented list.
 */
export default function Demo() {
  useState(() => {
    // The early install (`lib/demo/installEarly.ts`, via `app/_layout.tsx`)
    // already installed before the shell rendered; re-call it here so a
    // direct mount without the layout path still resolves, then install
    // idempotently as before.
    installDemoEarly();
    installDemoFetch(createDemoStore([buildDemoTrip(new Date())]));
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
  return (
    <View className="flex-1">
      <Column>
        <Text className="font-body text-sm text-ink">
          You got a text from {DEMO_INVITER_NAME}.
        </Text>
      </Column>
      <Invite />
    </View>
  );
}
