import type { RsvpStatus } from "@/lib/rsvp";

/**
 * Someone on a trip, shaped after the API's `MemberWithProfile` — the
 * fields the roll call needs, and the ones whose visibility the API
 * decides rather than the client.
 */
export type Member = {
  id: string;
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
 * Who "you" are in the lab.
 *
 * There is no signed-in identity here, so one member of the roster
 * stands in for the viewer. The organizer is the roster's own
 * organizer; a traveler is the first going member who still owes times
 *, because that is the state with something to do in it — the same
 * reason the trip screen defaults to the traveler.
 *
 * Both the trip screen's nudge and the board's Edit rule ask this
 * question, so they ask it here: one stand-in, never two that disagree.
 */
export function viewerMember(
  members: Member[],
  viewerIsOrganizer: boolean,
  filedMemberIds: string[],
): Member | null {
  const going = members.filter((member) => member.status === "going");
  if (viewerIsOrganizer) {
    return going.find((member) => member.isOrganizer) ?? null;
  }
  const filed = new Set(filedMemberIds);
  return (
    going.find((member) => !member.isOrganizer && !filed.has(member.id)) ??
    going.find((member) => !member.isOrganizer) ??
    null
  );
}
