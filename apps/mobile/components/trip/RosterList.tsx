import { Pressable } from "react-native";
import { ChipLink } from "@/components/ui/ChipLink";
import { PersonRow } from "@/components/ui/PersonRow";
import { useMotion } from "@/hooks/useMotion";
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
 * mapping. The press is a prop rather than part of the component: the
 * source wrapped an organizer's rows in a `Pressable` that pushed the
 * person dialog, and that press belongs to the screen that knows who
 * is looking. `app/trips/members.tsx` supplies it for an organizer,
 * exactly as before the lift, so the organizer's tap survives the
 * extraction; the demo supplies nothing, so its rows are plain views
 * and nothing can push an auth-gated route out of it.
 *
 * The one prop the dialog does not have is the viewer's own answer.
 * The dialog reads it off the roster; the demo holds it in `useState`
 * beside its RSVP control, so the row matching `viewerMemberId` reads
 * `viewerAnswer` instead — the tap that changes the control moves the
 * row with it.
 *
 * The row's own body is `PersonRow` (`components/ui/PersonRow.tsx`), which
 * the travel board wears too: the shape of a person's row is one thing,
 * and what a row *does* — the press, and the word this screen puts in its
 * far column — stays here.
 *
 * Reporting a person and blocking them are not on this row, and they are
 * not a missing prop either: those two decisions are about a person
 * rather than about a row in a list, and they live on the person's own
 * card (`components/trip/ReportOrBlock.tsx`). A word under every
 * account-backed row turned the roll call into a column of buttons
 * wearing people's names.
 */
export function RosterList({
  rows,
  viewerIsOrganizer,
  viewerMemberId = null,
  viewerAnswer = null,
  onPressRow,
}: {
  rows: RosterRow[];
  viewerIsOrganizer: boolean;
  viewerMemberId?: string | null;
  viewerAnswer?: RsvpStatus | null;
  /**
   * The caller's own press, handed in rather than assumed **and asked for
   * per row**: the function is called with each row and answers with that
   * row's handler, or with `undefined` where the caller has no route to
   * offer. A row with no handler is drawn as a plain row, never as a
   * button that leads nowhere — a traveler's guest row is exactly that,
   * and so is every row the demo draws.
   */
  onPressRow?: ((row: RosterRow) => (() => void) | undefined) | undefined;
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
          onPressRow={onPressRow}
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
  onPressRow,
  className,
}: {
  row: RosterRow;
  viewerIsOrganizer: boolean;
  viewerMemberId?: string | null;
  viewerAnswer?: RsvpStatus | null;
  onPressRow?: ((row: RosterRow) => (() => void) | undefined) | undefined;
  /**
   * The table's mark, handed down by `RuledRows`. It lands on the row's
   * own wrapper rather than on a press target, because the row's own
   * measure must not change with a permission.
   */
  className?: string;
}) {
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
      : farColumnFor(row.member, viewerMemberId, viewerAnswer);

  // The name and the accounts you can reach them on share a line; the
  // number hangs below it; and the part they play is centred against the
  // whole row, so the far column reads down the page however much detail
  // a row happens to carry. That shape is `PersonRow`'s, which the board
  // wears too; the mark is `RuledRows`'s, merged onto the row's own
  // wrapper by that component.
  const body = (
    <PersonRow
      name={name ?? ""}
      chips={
        <>
          {handles?.venmo ? (
            <ChipLink label="Venmo" href={venmoUrl(handles.venmo)} />
          ) : null}
          {handles?.instagram ? (
            <ChipLink label="Insta" href={instagramUrl(handles.instagram)} />
          ) : null}
        </>
      }
      detail={number}
      far={farColumn}
      // The roster capped neither line — the body this row replaced
      // (`077bb2e6`'s `RosterRowView`) put no `numberOfLines` on the name
      // or on the number — so a long member name wraps on the members
      // list exactly as it always did. The board's row wants the cap, and
      // that is `PersonRow`'s default.
      truncate={false}
      className={className}
    />
  );
  if (!onPressRow) return body;
  // Asked per row: a caller with no route for this one draws a plain row
  // rather than a button onto nothing.
  const press = onPressRow(row);
  if (!press) return body;
  return (
    <Pressable
      role="button"
      accessibilityRole="button"
      onPress={press}
      className={motion.rowOnGravel}
    >
      {body}
    </Pressable>
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
