import { useLocalSearchParams, useRouter } from "expo-router";

import { SettleLedger } from "@/components/trip/SettleLedger";
import { TripGate } from "@/components/trip/TripGate";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { useAuth } from "@/lib/authStore";
import { viewerOf } from "@/lib/members";
import { useMembers } from "@/lib/queries/members";
import { useTripSettings } from "@/lib/tripSettingsStore";
import { useTrip } from "@/lib/tripsStore";
import NotFound from "@/app/+not-found";

/**
 * Settle — the trip's ledger, behind the hero's fourth door.
 *
 * A dialog rather than a screen, because money is a utility and not a
 * browse surface: it answers one question about the trip you are already
 * looking at, the way the roll call and the travel board do. The body is
 * `SettleLedger`; this file is the trip it belongs to, the sheet's title,
 * and the one verb.
 *
 * The one value the body cannot read for itself is the zone the days were
 * stamped in, and it is computed here exactly as the forms compute it
 * (`app/trips/stay/new.tsx`): the display clock's setting, so a day is
 * read back in the zone it will be read in. `useDisplayZone` is
 * deliberately **not** called: the sheet shows days and no clock, and a
 * zone token names a clock.
 */
export default function TripSettle() {
  return (
    <TripGate label="Loading the ledger">
      <SettleDialog />
    </TripGate>
  );
}

function SettleDialog() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { for: settingsFor } = useTripSettings();

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  const { user } = useAuth();
  // The roster is the ledger's own read as much as this one: every door on
  // the sheet is addressed by a **member** id, and "You" is the row whose
  // account is the signed-in one — never a query param.
  const { members } = useMembers(trip?.id);
  const viewer = viewerOf(members, user?.id);

  // Read before the guard: a hook called after a return is a hook called a
  // different number of times.
  const { clock } = trip ? settingsFor(trip) : { clock: "trip" as const };
  const timeZone = clock === "trip" ? (trip?.preferredTimezone ?? null) : null;

  if (!trip) {
    return <NotFound />;
  }

  return (
    <FullscreenDialog
      title="Settle"
      primaryTitle="Add expense"
      onPrimary={() => router.push(`/trips/settle/form?id=${trip.id}`)}
      dismissHref={`/trips/detail?id=${trip.id}`}
    >
      <SettleLedger
        tripId={trip.id}
        timeZone={timeZone}
        viewerMemberId={viewer?.id ?? null}
      />
    </FullscreenDialog>
  );
}
