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
