/**
 * The roll call fold: members plus invitations into one list of people.
 *
 * A person is a member row (guest or not); an invitation with no member
 * row behind it is a person all the same. A `pending` or `failed`
 * invitation whose phone equals `guestPhone ?? phone` for some member
 * folds into that row (the row's `invited` becomes `true`) and adds no
 * second row. Anything else unmatched becomes an `invited` row.
 *
 * Why `guestPhone ?? phone` is the key: `Member.phone` collapses "no
 * number" and "number withheld by the API" into `""`, which cannot
 * match an invitation; `guestPhone` is the raw field, and it is only
 * present for an organizer viewer, which is also the only viewer who
 * is passed invitations. So the fold is organizer-only by
 * construction, not by a check.
 */
import type { Member } from "@/lib/members";
import type { TripInvitationRow } from "@/lib/queries/invitations";
import { formatPhoneForDisplay } from "@/lib/phone";
import type { RsvpStatus } from "@/lib/rsvp";

/** One row of the roll call. A person is a member row (guest or not);
 *  an invitation with no member row behind it is a person all the same. */
export type RosterRow =
  | { kind: "person"; member: Member; guest: boolean; invited: boolean }
  | { kind: "invited"; invitationId: string; phone: string; name: string | null };

/**
 * The fold key. `Member.phone` collapses "no number" and "number withheld
 * by the API" into `""`, which cannot match an invitation; `guestPhone` is
 * the raw field, and it is only present for an organizer viewer, which is
 * also the only viewer who is passed invitations. So the fold is
 * organizer-only by construction, not by a check.
 */
const foldKey = (member: Member) => member.guestPhone ?? member.phone;

/** Only these invitation statuses fold or render; the rest never do. */
const RENDERABLE_STATUS: ReadonlySet<TripInvitationRow["status"]> = new Set([
  "pending",
  "failed",
]);

/**
 * Reading order in one place, and it follows the far column: the list is
 * sorted by the word each row wears, so that column reads down in one
 * monotonic run and "who is coming" is the top of it. Organizing, then
 * the answers in the order a person gives them, then the people who are
 * not members at all — guests, who are on the trip but never answered,
 * and last the invitations that have not joined.
 *
 * `no_response` sits before `not_going`: one is silence that can still
 * become a yes, the other is an answer already given.
 *
 * A guest sorts as a guest rather than by its own status, because its
 * far column says Guest: sorting it by a status it never gave would
 * contradict the column this order follows.
 */
const STATUS_RANK: Record<RsvpStatus, number> = {
  going: 1,
  maybe: 2,
  no_response: 3,
  not_going: 4,
};

const ORGANIZER_RANK = 0;
const GUEST_RANK = 5;
const INVITED_RANK = 6;

const rosterRank = (row: RosterRow): number => {
  if (row.kind === "invited") return INVITED_RANK;
  if (row.member.isOrganizer) return ORGANIZER_RANK;
  if (row.guest) return GUEST_RANK;
  return STATUS_RANK[row.member.status];
};

/** The roll call's named ordering: one comparator, one line to flip. */
export const compareRosterRows = (a: RosterRow, b: RosterRow): number =>
  rosterRank(a) - rosterRank(b);

export function rosterRows(
  members: Member[],
  invitations: TripInvitationRow[],
): RosterRow[] {
  const renderable = invitations.filter((invitation) =>
    RENDERABLE_STATUS.has(invitation.status),
  );

  const invitedByKey = new Map<string, boolean>();
  const personRows: RosterRow[] = members.map((member) => {
    const key = foldKey(member);
    const invited =
      key !== "" &&
      renderable.some((invitation) => invitation.phone === key);
    if (invited) invitedByKey.set(key, true);
    return {
      kind: "person" as const,
      member,
      guest: member.userId === null,
      invited,
    };
  });

  const invitedRows: RosterRow[] = [];
  for (const invitation of renderable) {
    if (invitation.phone !== "" && invitedByKey.has(invitation.phone)) continue;
    invitedRows.push({
      kind: "invited",
      invitationId: invitation.id,
      phone: invitation.phone,
      name: invitation.name ?? formatPhoneForDisplay(invitation.phone),
    });
  }

  // Stable: equal ranks keep server order (members) and sent order (invitees).
  return [...personRows, ...invitedRows].sort(compareRosterRows);
}
