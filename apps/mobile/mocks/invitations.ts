/**
 * Invitations, as the API's public preview returns them.
 *
 * The preview endpoint is unauthenticated and selects four facts: the
 * trip's name, its destination, its dates, and who invited you. The
 * number is returned masked (`+1555****890`), which is why nothing on
 * the client can decide whether the reader is the invitee: only the
 * server can, when the number is presented.
 *
 * The ids are readable on purpose. In the app a friend arrives from a
 * text with the id already in the URL, so the id is a string nobody
 * types; here it is how the lab opens the screen, which is the only way
 * to see what a friend sees without a server to send the text.
 *
 * Two states and no more, because the others are not screens. An
 * invitation for the number that just signed in is not shown at all (the
 * server accepts it at sign-in and the trip is simply there), and one
 * that belongs to somebody else is not a state this screen can tell
 * apart.
 */
export type MockInvitation = {
  id: string;
  tripId: string;
  /** E.164, as the invitation was addressed. */
  inviteePhone: string;
  inviterName: string;
  status: "pending" | "declined";
};

export const INVITATIONS: MockInvitation[] = [
  {
    id: "invite-pending",
    tripId: "picos",
    inviteePhone: "+15551234567",
    // The roster's own organizer, so the card and the roll call agree.
    inviterName: "Ines Duarte",
    status: "pending",
  },
  {
    id: "invite-gone",
    tripId: "picos",
    inviteePhone: "+15559876543",
    inviterName: "Ines Duarte",
    status: "declined",
  },
];

/**
 * The invitation an id names, or nothing. Anything the server would
 * refuse to show reads the same way here: an id it has never heard of, a
 * withdrawn invitation, and an expired one are one answer, because the
 * endpoint returns null for all three.
 */
export function invitationById(
  id: string | undefined,
): MockInvitation | undefined {
  if (!id) return undefined;
  const found = INVITATIONS.find((invitation) => invitation.id === id);
  return found && found.status === "pending" ? found : undefined;
}

/**
 * Whether the signed-in number is the one the invitation was sent to.
 *
 * Compared on the last four digits, which is all the client ever has:
 * the preview masks the rest. The real answer is the server's, at the
 * moment the invitation is accepted, and this only decides which of two
 * screens is worth showing before that.
 */
export function addressedTo(
  invitation: MockInvitation,
  phoneNumber: string | null | undefined,
): boolean {
  if (!phoneNumber) return false;
  return (
    invitation.inviteePhone.slice(-4) === phoneNumber.replace(/\D/g, "").slice(-4)
  );
}
