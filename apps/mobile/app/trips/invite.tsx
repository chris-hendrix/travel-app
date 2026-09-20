import { Suspense } from "react";
import { useLocalSearchParams } from "expo-router";
import { InviteDialog } from "@/components/trip/InviteDialog";
import { useTrips } from "@/lib/tripsStore";
import { tripFor } from "@/lib/tripLookup";
import NotFound from "@/app/+not-found";

/**
 * Invite people, as a dialog.
 *
 * Reached from two places and one of them can be gone from under it: the
 * trip screen's own button, and the roll call's action bar. `from` says
 * which, only so the fallback landing is the screen that is actually
 * behind this one — a dismissal with history pops back regardless.
 *
 * Organizer-only, and held to that by where it is reached from: both
 * doors are the organizer's. The API is the real gate — inviting is an
 * organizer permission — and this screen is not pretending otherwise.
 */
export default function InvitePeople() {
  return (
    <Suspense fallback={null}>
      <InvitePeopleDialog />
    </Suspense>
  );
}

function InvitePeopleDialog() {
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const { trips } = useTrips();

  const tripId = typeof id === "string" ? id : undefined;
  const trip = tripFor(trips, tripId);

  if (!trip) {
    return <NotFound />;
  }

  return (
    <InviteDialog
      trip={trip}
      dismissHref={
        from === "members"
          ? `/trips/members?id=${trip.id}&as=organizer`
          : `/trips/detail?id=${trip.id}`
      }
    />
  );
}
