import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ChipLink } from "@/components/ui/ChipLink";
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
 * The row's second target is a prop for the same reason the press is.
 * The members dialog hangs one quiet word under a person's row — the
 * panel that reports or blocks them — and that panel needs the trip it
 * was opened on and the account looking at it, which the dialog holds
 * and the demo does not. It is a render prop rather than a flag because
 * what goes under the row is a screen's decision; this component only
 * decides that it is a sibling of the body rather than a control inside
 * it, since a pressable nested in a pressable answers two presses out of
 * one box and reads as one control to anything announcing the tree.
 */
export function RosterList({
  rows,
  viewerIsOrganizer,
  viewerMemberId = null,
  viewerAnswer = null,
  onPressRow,
  renderRowFooter,
}: {
  rows: RosterRow[];
  viewerIsOrganizer: boolean;
  viewerMemberId?: string | null;
  viewerAnswer?: RsvpStatus | null;
  /**
   * The caller's own press, handed in rather than assumed. An
   * organizer's row opens the person dialog and a caller with no
   * route to offer passes nothing and gets plain rows.
   */
  onPressRow?: ((row: RosterRow) => void) | undefined;
  /**
   * What goes under the row, under its own body. Nothing by default, and
   * a caller that passes it answers for every row it is handed —
   * including the rows with nobody to draw anything for.
   */
  renderRowFooter?: ((row: RosterRow) => ReactNode) | undefined;
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
          renderRowFooter={renderRowFooter}
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
  renderRowFooter,
  className,
}: {
  row: RosterRow;
  viewerIsOrganizer: boolean;
  viewerMemberId?: string | null;
  viewerAnswer?: RsvpStatus | null;
  onPressRow?: ((row: RosterRow) => void) | undefined;
  renderRowFooter?: ((row: RosterRow) => ReactNode) | undefined;
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
  // The footer is the caller's, and it is the row's sibling rather than
  // part of the press target: the mark stays on the body above it, so the
  // row's own measure does not change with a control either.
  const footer = renderRowFooter?.(row) ?? null;
  if (!onPressRow) {
    return (
      <>
        {body}
        {footer}
      </>
    );
  }
  return (
    <>
      <Pressable
        role="button"
        accessibilityRole="button"
        onPress={() => onPressRow(row)}
        className={motion.row}
      >
        {body}
      </Pressable>
      {footer}
    </>
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
