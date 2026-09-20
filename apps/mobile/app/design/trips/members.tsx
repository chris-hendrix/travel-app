import { Suspense } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { ChipLink } from "@/components/ui/ChipLink";
import { useTrips } from "@/lib/tripsStore";
import { memberLabel } from "@/lib/rsvp";
import { visiblePhone, type Member } from "@/lib/members";
import { instagramUrl, venmoUrl } from "@/lib/links";
import { formatPhone } from "@/lib/profile";
import { membersFor } from "@/mocks/members";

/**
 * The roll call, reached from "6 going" on the trip header.
 *
 * A dialog rather than a screen: it is a disclosure of one line on the
 * screen behind it, which is why there is nothing to author here. The
 * one action the dialog does carry is the organizer's, and it is not
 * authoring this list either — it is the way to make it longer:
 * Invite people, which is also the trip screen's loudest button, and the
 * same screen whichever door you come through.
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
 * of the members who chose to share theirs. The account chips are on the
 * row for everyone — an Instagram is a thing you put out in public, and a
 * phone number is not, which is the whole reason only one of them is
 * gated.
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
  const router = useRouter();

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
      // The traveler gets no bar at all: an action bar with nothing in it
      // is chrome, and there is nothing here a traveler may do.
      primaryTitle={viewerIsOrganizer ? "Invite people" : undefined}
      onPrimary={
        viewerIsOrganizer
          ? () =>
              router.push(`/design/trips/invite?id=${trip.id}&from=members`)
          : undefined
      }
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
 * One person. The name and the accounts you can reach them on share a
 * line; the number hangs below it; and the part they play is centred
 * against the whole row, so the far column reads down the page however
 * much detail a row happens to carry.
 *
 * A chip says where an account is, not what it is called — "Insta", not
 * a username. The handle is the link's business, and a roster is not a
 * place to publish everyone's usernames.
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
    <View className="flex-row items-center justify-between gap-4 border-b border-b-ink py-3">
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-3">
          <Text className="font-body-bold text-base text-ink">
            {member.name}
          </Text>
          {member.handles?.venmo ? (
            <ChipLink
              label="Venmo"
              href={venmoUrl(member.handles.venmo)}
            />
          ) : null}
          {member.handles?.instagram ? (
            <ChipLink
              label="Insta"
              href={instagramUrl(member.handles.instagram)}
            />
          ) : null}
        </View>
        {phone ? (
          <Text className="font-body text-sm text-ink">
            {formatPhone(phone)}
          </Text>
        ) : null}
      </View>
      <Text className="font-body text-sm text-ink">
        {memberLabel(member)}
      </Text>
    </View>
  );
}
