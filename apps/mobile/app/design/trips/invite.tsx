import { Suspense } from "react";
import { Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { InviteDialog } from "@/components/trip/InviteDialog";
import { useTrips } from "@/lib/tripsStore";

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
  const trip = trips.find((candidate) => candidate.id === tripId) ?? trips[0];

  if (!trip) {
    return (
      <FullscreenDialog title="Invite people" dismissHref="/design/trips">
        <Text className="font-body text-base text-ink">
          No trip to invite anyone to. Start one from the trips screen.
        </Text>
      </FullscreenDialog>
    );
  }

  return (
    <InviteDialog
      trip={trip}
      dismissHref={
        from === "members"
          ? `/design/trips/members?id=${trip.id}&as=organizer`
          : `/design/trips/detail?id=${trip.id}`
      }
    />
  );
}
