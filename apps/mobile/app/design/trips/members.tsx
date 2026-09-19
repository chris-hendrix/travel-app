import { Suspense } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Badge } from "@/components/ui/Badge";
import { useTrips } from "@/lib/tripsStore";
import { memberLabel } from "@/lib/rsvp";
import { visiblePhone, type Member } from "@/lib/members";
import { formatPhone } from "@/lib/profile";
import { membersFor } from "@/mocks/members";

/**
 * The roll call, reached from "6 going" on the trip header.
 *
 * A dialog rather than a screen: it is a disclosure of one line on the
 * screen behind it, and nothing gets authored here. No action bar, for
 * the same reason — with the invite flow built, the organizer's version
 * of this dialog is where "Invite people" would sit.
 *
 * The organizer is first and is labeled Organizing: the far column says
 * what each person's part in the trip is, and for the organizer that is
 * the job rather than the answer everyone else had to give. Going is
 * what an organizer is without being asked, so saying it would spend the
 * column on the one row that never chose.
 *
 * How much of a person you get is the API's decision, not this screen's:
 * an organizer sees every number, because they are running the trip and
 * someone has to be able to reach the group; a traveler sees the numbers
 * of the members who chose to share theirs. Handles are on the row for
 * everyone — an Instagram is a thing you put out in public, and a phone
 * number is not, which is the whole reason only one of them is gated.
 */
export default function TripMembers() {
  return (
    <Suspense fallback={null}>
      <TripMembersDialog />
    </Suspense>
  );
}

function TripMembersDialog() {
  const { id, as } = useLocalSearchParams<{ id?: string; as?: string }>();
  const { trips } = useTrips();

  const tripId = typeof id === "string" ? id : undefined;
  const trip = trips.find((candidate) => candidate.id === tripId) ?? trips[0];
  // The lab's stand-in for `isOrganizer` on the membership, threaded down
  // from the trip screen so the two can never disagree.
  const viewerIsOrganizer = as === "organizer";

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
      {/* Ruled rows, like every other list here: the part each person
          plays sits at the far edge so the column can be read down. */}
      <View className="border-t border-ink">
        {membersFor(trip).map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            viewerIsOrganizer={viewerIsOrganizer}
          />
        ))}
      </View>
    </FullscreenDialog>
  );
}

/**
 * One person. The name and the part they play share the top line, and
 * everything else about them hangs below it — so the status column reads
 * down the page unbroken however much detail a row happens to carry.
 */
function MemberRow({
  member,
  viewerIsOrganizer,
}: {
  member: Member;
  viewerIsOrganizer: boolean;
}) {
  const phone = visiblePhone(member, viewerIsOrganizer);

  return (
    <View className="flex-row items-start justify-between gap-4 border-b border-b-ink py-3">
      <View className="flex-1 gap-1">
        <Text className="font-body-bold text-base text-ink">
          {member.name}
        </Text>
        {phone ? (
          <Text className="font-body text-sm text-ink">
            {formatPhone(phone)}
          </Text>
        ) : null}
        {member.handles ? (
          <View className="flex-row flex-wrap items-center gap-2 pt-1">
            {member.handles.venmo ? (
              <Badge
                label={`Venmo ${member.handles.venmo}`}
                variant="outline"
              />
            ) : null}
            {member.handles.instagram ? (
              <Badge
                label={`Instagram ${member.handles.instagram}`}
                variant="outline"
              />
            ) : null}
          </View>
        ) : null}
      </View>
      <Text className="font-body text-sm text-ink">
        {memberLabel(member)}
      </Text>
    </View>
  );
}
