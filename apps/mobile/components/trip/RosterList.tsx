import { Text, View } from "react-native";
import { ChipLink } from "@/components/ui/ChipLink";
import { RuledRows } from "@/components/ui/RuledRows";
import { visiblePhone, type Member } from "@/lib/members";
import { RSVP_LABEL, memberLabel, type RsvpStatus } from "@/lib/rsvp";
import { instagramUrl, venmoUrl } from "@/lib/links";
import { formatPhoneForDisplay } from "@/lib/phone";
import type { RosterRow } from "@/lib/roster";

/**
 * The roll call, lifted from the members dialog's `MemberRow`
 * (`app/trips/members.tsx`) so the demo can read the same roster
 * without the dialog's queries.
 *
 * No new logic: same conditionals, same class strings, same data
 * mapping. The rows are non-interactive — the source's press pushes
 * the person dialog, an organizer-only route that would dead-end the
 * demo — so the router, the press wrapper and the motion row are
 * gone, and `tripId` goes with them. The traveler's rows were already
 * plain views; now every row is one.
 *
 * The one prop the dialog does not have is the viewer's own answer.
 * The dialog reads it off the roster; the demo holds it in `useState`
 * beside its RSVP control, so the row matching `viewerMemberId` reads
 * `viewerAnswer` instead — the tap that changes the control moves the
 * row with it.
 */
export function RosterList({
  rows,
  viewerIsOrganizer,
  viewerMemberId = null,
  viewerAnswer = null,
}: {
  rows: RosterRow[];
  viewerIsOrganizer: boolean;
  viewerMemberId?: string | null;
  viewerAnswer?: RsvpStatus | null;
}) {
  return (
    <RuledRows>
      {rows.map((row) => (
        <RosterRowView
          key={row.kind === "person" ? row.member.id : row.invitationId}
          row={row}
          viewerIsOrganizer={viewerIsOrganizer}
          viewerMemberId={viewerMemberId}
          viewerAnswer={viewerAnswer}
        />
      ))}
    </RuledRows>
  );
}

function RosterRowView({
  row,
  viewerIsOrganizer,
  viewerMemberId,
  viewerAnswer,
  className,
}: {
  row: RosterRow;
  viewerIsOrganizer: boolean;
  viewerMemberId?: string | null;
  viewerAnswer?: RsvpStatus | null;
  /**
   * The table's mark, handed down by `RuledRows`. It lands on the row's
   * own wrapper rather than on a press target, because the row's own
   * measure must not change with a permission.
   */
  className?: string;
}) {
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
      : farColumnFor(row.member, viewerMemberId, viewerAnswer);

  // The name and the accounts you can reach them on share a line; the
  // number hangs below it; and the part they play is centred against the
  // whole row, so the far column reads down the page however much detail
  // a row happens to carry. The mark is `RuledRows`'s, merged onto the
  // row's own wrapper.
  return (
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
}

/**
 * The part the person plays, read across the far column. The viewer's
 * own row reads the live answer the demo holds in state, so the tap
 * moves it; every other row reads the roster exactly as the dialog
 * did. A null answer is the dialog's own behaviour — the roster's
 * word, untouched.
 */
function farColumnFor(
  member: Member,
  viewerMemberId: string | null | undefined,
  viewerAnswer: RsvpStatus | null | undefined,
): string {
  if (
    viewerAnswer !== null &&
    viewerAnswer !== undefined &&
    member.id === viewerMemberId
  ) {
    return RSVP_LABEL[viewerAnswer];
  }
  return memberLabel(member);
}

/**
 * The row's own body: one line, the person's name and accounts on the
 * left, the part they play on the right, and the vertical space that
 * belongs to the row rather than to the mark above it. It was one string
 * written twice — once per row kind — and the merge is what leaves one.
 */
const ROW_BODY = "flex-row items-center justify-between gap-4 py-3";
