import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Button } from "@/components/ui/Button";
import { RosterList } from "@/components/trip/RosterList";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useAuth } from "@/lib/authStore";
import { viewerOf } from "@/lib/members";
import { useMembers } from "@/lib/queries/members";
import { useTripInvitations } from "@/lib/queries/invitations";
import { rosterRows } from "@/lib/roster";

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
    <TripGate label="Loading trip members">
      <TripMembersDialog />
    </TripGate>
  );
}

function TripMembersDialog() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();

  const tripId = typeof id === "string" ? id : undefined;
  const { trip } = useTrip(tripId);
  const { user } = useAuth();
  // The roll call is server state now, suspended under the same gate
  // as the trip above — the dialog never renders without it.
  const { members } = useMembers(trip?.id);
  // Who you are comes from the server: your own roster row, matched
  // by account, carries your role — never a query param.
  const viewer = viewerOf(members, user?.id);
  const viewerIsOrganizer = viewer?.isOrganizer ?? false;
  // The traveler is handed no invitations, so `rosterRows` produces no
  // `invited` rows for them — the traveler variant falls out of the
  // `enabled` flag, not a filter. A traveler never reaches the person
  // dialog, so their rows stay plain views.
  const { invitations } = useTripInvitations(trip?.id, viewerIsOrganizer);
  const rows = rosterRows(members, invitations);

  if (!trip) {
    return <NotFound />;
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
              router.push(`/trips/invite?id=${trip.id}&from=members`)
          : undefined
      }
      dismissHref={`/trips/detail?id=${trip.id}`}
    >
      {/* A table: each row is read across — a name, the accounts you can
          reach them on, the part they play — so the rows keep one soft
          rule between them, from `RuledRows`. The first row has none: the
          header above already closes the top of this list with its own
          edge, and a rule under that would be a second mark for one
          boundary. What went with the gravel is the rule *under* the last
          row, which duplicated nothing above it. The part each person
          plays sits at the far edge so the column can be read down. */}
      <RosterList
        rows={rows}
        viewerIsOrganizer={viewerIsOrganizer}
        viewerMemberId={viewer?.id ?? null}
        // The dialog reads the viewer's answer off the roster, so this
        // is the roster's own word handed back: an organizer keeps the
        // roster's label (their row says Organizing, never an answer).
        viewerAnswer={
          viewer && !viewer.isOrganizer ? viewer.status : null
        }
      />
      {/* Under the list, not in the bar: adding a guest lengthens the
          roll call rather than inviting, which is what the bar is for.
          A described block in the shape the person dialog's own Manage
          sections take, since it is the same kind of thing: one action
          with its reason. The traveler gets nothing here — there is
          nothing a traveler may do. */}
      {viewerIsOrganizer ? (
        <View className="gap-2 pt-6">
          <Text className="font-body-bold text-base text-ink">
            Add a guest
          </Text>
          <Text className="font-body text-sm text-ink opacity-60">
            Plan for them without inviting them.
          </Text>
          <Button
            title="Add a guest"
            variant="secondary"
            onPress={() => router.push(`/trips/members/new?id=${trip.id}`)}
          />
        </View>
      ) : null}
    </FullscreenDialog>
  );
}
