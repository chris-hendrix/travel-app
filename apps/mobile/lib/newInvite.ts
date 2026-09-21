import { formatPhoneForDisplay, phoneError, toE164 } from "@/lib/phone";
import type { Tripmate } from "@/mocks/tripmates";

/**
 * What one send did, in the three states the endpoint actually has.
 *
 * Invitations go to a tripmate, and to a number nobody has an account
 * on. A number that already has an account *joins* instead — the server
 * adds the member and sends a text rather than an invitation, which is
 * why this is three lists and not one. Skipped is who was already on the
 * trip, and it is the reason the dialog says so rather than reporting a
 * tidy success.
 */
export type InviteOutcome = {
  /** Who gets an invitation: labels, as the dialog will read them. */
  invited: string[];
  /** Who joins without answering, because the number is an account. */
  added: string[];
  /** Who was already on the trip, by name. */
  skipped: string[];
};

export type InviteInput = {
  /** Tripmate ids picked from the list. */
  tripmateIds: string[];
  /** Numbers typed in, already normalized. */
  phoneNumbers: string[];
};

/**
 * Why a typed number cannot be added yet, or nothing.
 *
 * Empty and malformed are different problems with different fixes, so
 * they are different sentences, and both come from the phone module, so
 * the invite dialog and the sign-in screen cannot disagree about what a
 * number is. "Already added" is checked on the E.164, or the same number
 * typed twice in different shapes would land twice.
 */
export function phoneNumberError(
  raw: string,
  already: string[],
): string | undefined {
  const phone = toE164(raw);
  if (!phone) return phoneError(raw);
  if (already.includes(phone)) return "That number is already added.";

  return undefined;
}

/**
 * The suggestions a name narrows to.
 *
 * A **prefix** match, case-insensitive, because that is what the server
 * does — `LIKE search%` on the display name — and a filter that quietly
 * accepts more than the real one would is a filter that lets somebody
 * pick a person the next screen cannot find. Empty means everything.
 *
 * The order is the server's own three keys, in the server's order: most
 * trips shared first, then the name, then the id. The second and third
 * are not decoration. Most people share one trip with you, so the first
 * key alone leaves a long tie, and a tie broken by whatever order the
 * rows happened to arrive in is a list that reshuffles between two reads
 * of the same data. The sort applies to the empty query too, which is
 * the case the section opens in.
 */
export function filterTripmates(
  tripmates: Tripmate[],
  query: string,
): Tripmate[] {
  const search = query.trim().toLowerCase();

  return tripmates
    .filter(
      (tripmate) =>
        !search || tripmate.name.toLowerCase().startsWith(search),
    )
    .sort(
      (a, b) =>
        b.sharedTripCount - a.sharedTripCount ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
}

/**
 * The send, in the lab: the server's own three outcomes, worked out
 * against the roster and the pool of tripmates.
 *
 * The order is the order of the screen — the people picked, then the
 * numbers typed — so what comes back reads like the thing that was sent.
 */
export function sendInvitations({
  input,
  tripmates,
  members,
}: {
  input: InviteInput;
  tripmates: Tripmate[];
  /** This trip's roster: their names, and the numbers they hold. */
  members: Array<{ name: string; phone: string }>;
}): InviteOutcome {
  const invited: string[] = [];
  const added: string[] = [];
  const skipped: string[] = [];

  const memberNames = new Map(
    members.map((member) => [member.phone, member.name]),
  );
  const accounts = new Map(tripmates.map((tripmate) => [tripmate.phone, tripmate]));

  for (const id of input.tripmateIds) {
    const tripmate = tripmates.find((candidate) => candidate.id === id);
    if (tripmate) invited.push(tripmate.name);
  }

  for (const phone of input.phoneNumbers) {
    const member = memberNames.get(phone);
    if (member) {
      skipped.push(member);
      continue;
    }

    const account = accounts.get(phone);
    if (account) {
      added.push(account.name);
      continue;
    }

    // Nobody we know: an invitation by text, and the number is what it
    // is addressed to.
    invited.push(formatPhoneForDisplay(phone));
  }

  return { invited, added, skipped };
}
