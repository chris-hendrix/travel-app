import { useLocalSearchParams } from "expo-router";
import { InviteDialog } from "@/components/trip/InviteDialog";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
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
    <TripGate label="Loading people to invite">
      <InvitePeopleDialog />
    </TripGate>
  );
}

function InvitePeopleDialog() {
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);

  if (!trip) {
    return <NotFound />;
  }

  return (
    <InviteDialog
      trip={trip}
      dismissHref={
        from === "members"
          ? `/trips/members?id=${trip.id}`
          : `/trips/detail?id=${trip.id}`
      }
    />
  );
}
