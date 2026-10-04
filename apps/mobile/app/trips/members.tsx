import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FullscreenDialog } from "@/components/ui/FullscreenDialog";
import { Button } from "@/components/ui/Button";
import { ChipLink } from "@/components/ui/ChipLink";
import { useMotion } from "@/hooks/useMotion";
import { useTrip } from "@/lib/tripsStore";
import { TripGate } from "@/components/trip/TripGate";
import NotFound from "@/app/+not-found";
import { useAuth } from "@/lib/authStore";
import { visiblePhone, viewerOf } from "@/lib/members";
import { memberLabel } from "@/lib/rsvp";
import { instagramUrl, venmoUrl } from "@/lib/links";
import { formatPhoneForDisplay } from "@/lib/phone";
import { useMembers } from "@/lib/queries/members";
import { useTripInvitations } from "@/lib/queries/invitations";
import { rosterRows, type RosterRow } from "@/lib/roster";
import { RuledRows } from "@/components/ui/RuledRows";

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
      {/* A table: each row is read across — a name, the accounts you can
          reach them on, the part they play — so the rows keep one soft
          rule between them, from `RuledRows`. The first row has none: the
          header above already closes the top of this list with its own
          edge, and a rule under that would be a second mark for one
          boundary. What went with the gravel is the rule *under* the last
          row, which duplicated nothing above it. The part each person
          plays sits at the far edge so the column can be read down. */}
      <RuledRows>
        {rows.map((row) => (
          <MemberRow
            key={row.kind === "person" ? row.member.id : row.invitationId}
            row={row}
            tripId={trip.id}
            viewerIsOrganizer={viewerIsOrganizer}
          />
        ))}
      </RuledRows>
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

/**
 * One row of the roll call, of either kind, and one wrapper for both.
 *
 * A member and an invitee are the same row with two different far columns
 * — `memberLabel` or `Guest` for a person, `Invited` for an invitation
 * with nobody behind it yet — and they were the same row in the markup
 * too, down to the byte-identical class string, which is why they are one
 * component now. The far column is the row's *kind*, not its state: a
 * guest reads `Guest` even with a pending invitation behind them (the
 * fold, not a second row, is where that invitation lives).
 *
 * Only the organizer's rows press: they open the person dialog, a member
 * behind `?member=` or an invitee behind `?invite=`. A traveler's rows
 * are not pressable — a traveler never reaches that dialog — and that
 * conditional is the one piece of behaviour the merge had to keep exactly
 * as it was, which is why the press target is one `if` at the bottom
 * rather than something cleverer higher up.
 */
function MemberRow({
  row,
  tripId,
  viewerIsOrganizer,
  className,
}: {
  row: RosterRow;
  tripId: string;
  viewerIsOrganizer: boolean;
  /**
   * The table's mark, handed down by `RuledRows`. It lands on the row's
   * own wrapper rather than on the `Pressable`, because the press wrapper
   * is conditional on the viewer and the row's own measure must not change
   * with a permission.
   */
  className?: string;
}) {
  const router = useRouter();
  const motion = useMotion();
  const invited = row.kind === "invited";
  // A chip says where an account is, not what it is called — "Insta", not
  // a username. The handle is the link's business, and a roster is not a
  // place to publish everyone's usernames. Only a member has one.
  const handles = invited ? null : row.member.handles;
  const phone = invited ? null : visiblePhone(row.member, viewerIsOrganizer);
  // `rosterRows` falls back to the formatted phone as an invitation's
  // name, so an invitee's number hangs below only when there is a real
  // name above it.
  const showInvitedPhone =
    invited &&
    row.name !== null &&
    row.name !== formatPhoneForDisplay(row.phone);
  const name = invited
    ? showInvitedPhone
      ? row.name
      : formatPhoneForDisplay(row.phone)
    : row.member.name;
  const number = invited
    ? showInvitedPhone
      ? formatPhoneForDisplay(row.phone)
      : null
    : phone
      ? formatPhoneForDisplay(phone)
      : null;
  const farColumn = invited
    ? "Invited"
    : row.guest
      ? "Guest"
      : memberLabel(row.member);

  // The name and the accounts you can reach them on share a line; the
  // number hangs below it; and the part they play is centred against the
  // whole row, so the far column reads down the page however much detail
  // a row happens to carry. The mark is `RuledRows`'s, merged onto the
  // row's own wrapper.
  const body = (
    <View className={[ROW_BODY, className].filter(Boolean).join(" ")}>
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-3">
          <Text className="font-body-bold text-base text-ink">{name}</Text>
          {handles?.venmo ? (
            <ChipLink label="Venmo" href={venmoUrl(handles.venmo)} />
          ) : null}
          {handles?.instagram ? (
            <ChipLink label="Insta" href={instagramUrl(handles.instagram)} />
          ) : null}
        </View>
        {number ? (
          <Text className="font-body text-sm text-ink">{number}</Text>
        ) : null}
      </View>
      <Text className="font-body text-sm text-ink">{farColumn}</Text>
    </View>
  );
  if (!viewerIsOrganizer) return body;
  return (
    <Pressable
      role="button"
      accessibilityRole="button"
      onPress={() =>
        router.push(
          invited
            ? `/trips/members/detail?id=${tripId}&invite=${row.invitationId}`
            : `/trips/members/detail?id=${tripId}&member=${row.member.id}`,
        )
      }
      className={motion.row}
    >
      {body}
    </Pressable>
  );
}

/**
 * The row's own body: one line, the person's name and accounts on the
 * left, the part they play on the right, and the vertical space that
 * belongs to the row rather than to the mark above it. It was one string
 * written twice — once per row kind — and the merge is what leaves one.
 */
const ROW_BODY = "flex-row items-center justify-between gap-4 py-3";
