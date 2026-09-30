import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Button } from "@/components/ui/Button";
import { ChipLink } from "@/components/ui/ChipLink";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useAuth } from "@/lib/authStore";
import { visiblePhone, viewerOf, type Member } from "@/lib/members";
import { memberLabel } from "@/lib/rsvp";
import { instagramUrl, venmoUrl } from "@/lib/links";
import { formatPhoneForDisplay } from "@/lib/phone";
import { useMembers } from "@/lib/queries/members";
import { useTripInvitations } from "@/lib/queries/invitations";
import { rosterRows, type RosterRow } from "@/lib/roster";

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
  const viewerIsOrganizer = viewerOf(members, user?.id)?.isOrganizer ?? false;
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
      {/* The rows carry their own gravel rules, one under each, and the
          roster is the dialog's first block: a rule above it would mark
          a boundary that is not there, since the header already closes
          the top. The part each person plays sits at the far edge so
          the column can be read down. */}
      <View>
        {rows.map((row) => (
          <RosterRowItem
            key={row.kind === "person" ? row.member.id : row.invitationId}
            row={row}
            tripId={trip.id}
            viewerIsOrganizer={viewerIsOrganizer}
          />
        ))}
      </View>
      {/* Under the list, not in the bar: adding a guest lengthens the
          roll call rather than inviting, which is what the bar is for.
          A block with its heading and its reason, the shape the
          person dialog's own Manage sections take. The traveler gets
          nothing here — there is nothing a traveler may do. */}
      {viewerIsOrganizer ? (
        <View className="pt-6">
          <View className="gap-1">
            <Text className="font-body-bold text-base text-ink">
              Add a guest
            </Text>
            <Text className="font-body text-base text-ink">
              They need no app. You plan for them.
            </Text>
          </View>
          <View className="mt-3">
            <Button
              title="Add a guest"
              variant="secondary"
              onPress={() => router.push(`/trips/members/new?id=${trip.id}`)}
            />
          </View>
        </View>
      ) : null}
    </FullscreenDialog>
  );
}

/**
 * One row of the roll call. The far column is the row's kind, not its
 * state: a member reads `memberLabel`, a guest reads `Guest` even with
 * a pending invitation behind them (the fold, not a second row, is
 * where that invitation lives), and an invitation with no row behind
 * it reads `Invited`.
 *
 * Only the organizer's rows press: they open the person dialog, a
 * member behind `?member=` or an invitee behind `?invite=`. A
 * traveler's rows are not pressable — a traveler never reaches that
 * dialog.
 */
function RosterRowItem({
  row,
  tripId,
  viewerIsOrganizer,
}: {
  row: RosterRow;
  tripId: string;
  viewerIsOrganizer: boolean;
}) {
  const router = useRouter();
  if (row.kind === "invited") {
    // `rosterRows` falls back to the formatted phone as the name, so
    // the number hangs below only when there is a real name above it.
    const showPhone =
      row.name !== null && row.name !== formatPhoneForDisplay(row.phone);
    const body = (
      <View className="flex-row items-center justify-between gap-4 border-b border-b-gravel py-3">
        <View className="flex-1 gap-1">
          <Text className="font-body-bold text-base text-ink">
            {showPhone ? row.name : formatPhoneForDisplay(row.phone)}
          </Text>
          {showPhone ? (
            <Text className="font-body text-sm text-ink">
              {formatPhoneForDisplay(row.phone)}
            </Text>
          ) : null}
        </View>
        <Text className="font-body text-sm text-ink">Invited</Text>
      </View>
    );
    if (!viewerIsOrganizer) return body;
    return (
      <Pressable
        role="button"
        accessibilityRole="button"
        onPress={() =>
          router.push(
            `/trips/members/detail?id=${tripId}&invite=${row.invitationId}`,
          )
        }
      >
        {body}
      </Pressable>
    );
  }

  return (
    <MemberRow
      member={row.member}
      guest={row.guest}
      tripId={tripId}
      viewerIsOrganizer={viewerIsOrganizer}
    />
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
  guest,
  tripId,
  viewerIsOrganizer,
}: {
  member: Member;
  guest: boolean;
  tripId: string;
  viewerIsOrganizer: boolean;
}) {
  const router = useRouter();
  const phone = visiblePhone(member, viewerIsOrganizer);

  const body = (
    <View className="flex-row items-center justify-between gap-4 border-b border-b-gravel py-3">
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
            {formatPhoneForDisplay(phone)}
          </Text>
        ) : null}
      </View>
      <Text className="font-body text-sm text-ink">
        {guest ? "Guest" : memberLabel(member)}
      </Text>
    </View>
  );
  if (!viewerIsOrganizer) return body;
  return (
    <Pressable
      role="button"
      accessibilityRole="button"
      onPress={() =>
        router.push(`/trips/members/detail?id=${tripId}&member=${member.id}`)
      }
    >
      {body}
    </Pressable>
  );
}
