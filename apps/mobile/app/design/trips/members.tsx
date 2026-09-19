import { Suspense } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { useTrips } from "@/lib/tripsStore";
import { RSVP_LABEL } from "@/lib/rsvp";
import { membersFor } from "@/mocks/members";

/**
 * The roll call, reached from "6 going" on the trip header.
 *
 * A dialog rather than a screen: it is a disclosure of one line on the
 * screen behind it, and nothing gets authored here. No action bar, for
 * the same reason — with the invite flow built, the organizer's version
 * of this dialog is where "Invite people" would sit.
 */
export default function TripMembers() {
  return (
    <Suspense fallback={null}>
      <TripMembersDialog />
    </Suspense>
  );
}

function TripMembersDialog() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { trips } = useTrips();

  const tripId = typeof id === "string" ? id : undefined;
  const trip = trips.find((candidate) => candidate.id === tripId) ?? trips[0];

  if (!trip) {
    return (
      <FullscreenDialog title="Who's coming" dismissHref="/design/trips">
        <Text className="font-body text-base text-ink">
          No trip to show. Start one from the trips screen.
        </Text>
      </FullscreenDialog>
    );
  }

  return (
    <FullscreenDialog
      title="Who's coming"
      dismissHref={`/design/trips/detail?id=${trip.id}`}
    >
      {/* Ruled rows, like every other list here: the status sits at the
          far edge so the column can be read down. */}
      <View className="border-t border-ink">
        {membersFor(trip).map((member) => (
          <View
            key={member.id}
            className="flex-row items-baseline justify-between gap-4 border-b border-b-ink py-3"
          >
            <Text className="font-body-bold text-base text-ink">
              {member.name}
            </Text>
            <Text className="font-body text-sm text-ink">
              {RSVP_LABEL[member.status]}
            </Text>
          </View>
        ))}
      </View>
    </FullscreenDialog>
  );
}
