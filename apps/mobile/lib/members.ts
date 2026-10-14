import type { RsvpStatus } from "@/lib/rsvp";

/**
 * Someone on a trip, shaped after the API's `MemberWithProfile` — the
 * fields the roll call needs, and the ones whose visibility the API
 * decides rather than the client.
 */
export type Member = {
  id: string;
  /** The account behind the row; null for guest members. */
  userId: string | null;
  name: string;
  status: RsvpStatus;
  /**
   * A role, not a rank: the API carries this per member, so a trip can
   * have more than one — a co-organizer is an organizer.
   */
  isOrganizer: boolean;
  /** E.164, as the account holds it. */
  phone: string;
  /**
   * The raw guest number, only present for an organizer viewer on
   * guest rows. The roll call folds invitations into the roster on
   * this key — deliberately distinct from `phone`, which collapses
   * absent to "" and can never match an invitation.
   */
  guestPhone?: string | undefined;
  /**
   * Whether this member lets the other travelers see that number. An
   * organizer is not bound by it — they are running the trip — and
   * everyone else is.
   */
  sharePhone: boolean;
  /** Venmo and Instagram, when they have them. Absent, not empty. */
  handles: { venmo?: string; instagram?: string } | null;
};

/**
 * Whose number you get to see.
 *
 * The API's own rule, and the reason this is a function rather than a
 * line in the dialog: phone numbers are included when the requesting
 * user is an organizer, or the member has opted in with sharePhone.
 * Everyone's number is on the account; sharing it is a choice each
 * member makes about the others, and the organizer is the exception
 * because someone has to be able to reach the group.
 */
export function visiblePhone(
  member: Member,
  viewerIsOrganizer: boolean,
): string | null {
  return viewerIsOrganizer || member.sharePhone ? member.phone : null;
}

/**
 * Who you are: the roster row whose account matches the signed-in
 * user. The role comes from the server that way — `isOrganizer` on
 * your own row — never from a query param.
 */
export function viewerOf(
  members: Member[],
  userId: string | undefined | null,
): Member | null {
  if (!userId) return null;
  return members.find((member) => member.userId === userId) ?? null;
}

/**
 * Who the trip is waiting on: the members who said they are going.
 *
 * One answer rather than one per surface, because two surfaces ask it —
 * the travel board, whose rows are this roster plus whoever filed, and
 * the trip page's Add travel, which stays while anybody in this set
 * still owes a time. A member who has not answered, or answered no, is
 * not somebody whose flights the trip is holding a seat on.
 */
export function goingMembers(members: Member[]): Member[] {
  return members.filter((member) => member.status === "going");
}

/**
 * Who the travel form can file for: everyone going, plus anyone who
 * already holds a record on this trip.
 *
 * The second half is not a courtesy, it is the fix for a raw member id
 * appearing in the field. A member who answered "maybe" can still hold
 * an arrival — the board draws them, and the API accepts a record for
 * them — but they have no place in the going roster, so a picker built
 * on that roster alone cannot name them and the form falls back to
 * printing their id. The going roster stays first because that is the
 * order the trip is planned in; the holders follow it.
 */
export function travelMemberOptions(
  members: Member[],
  records: ReadonlyArray<{ memberId: string }>,
): Member[] {
  const holding = new Set(records.map((record) => record.memberId));
  const going = goingMembers(members);
  const goingIds = new Set(going.map((member) => member.id));
  // `goingIds` rather than a dedupe pass: a member who is already in
  // the first list cannot enter the second, so no id is ever emitted
  // twice and a member holding a record never moves.
  const holders = members.filter(
    (member) => holding.has(member.id) && !goingIds.has(member.id),
  );
  return [...going, ...holders];
}
