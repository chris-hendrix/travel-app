import { PHONE_REGEX } from "@journiful/shared/schemas";
import { formatPhone } from "@/lib/profile";
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
 * A number as the API takes it: digits and a leading plus.
 *
 * The field has to accept what a person types — "+34 600 123 456", a
 * number pasted out of a message with a dash in it — because the machine
 * format is the endpoint's business and not theirs. The web does this
 * inside its phone input; the lab does it once, here, on the way in.
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  return (trimmed.startsWith("+") ? "+" : "") + trimmed.replace(/\D/g, "");
}

/**
 * Why a typed number cannot be added yet, or nothing.
 *
 * Empty and malformed are different problems with different fixes, so
 * they are different sentences, and the country code is a third: the
 * field arrives with one already in it, so "no country code" is only
 * ever something somebody deleted. "Already added" is checked on the
 * normalized number, or the same number typed twice in different shapes
 * would land twice.
 */
export function phoneNumberError(
  raw: string,
  already: string[],
): string | undefined {
  const phone = normalizePhone(raw);
  const digits = phone.replace("+", "");

  // Nothing yet, or nothing but the country code the field starts with.
  if (digits.length < 2) return "Enter a number.";
  if (!phone.startsWith("+")) {
    return "A country code, like +1 555 123 4567.";
  }
  if (!PHONE_REGEX.test(phone)) return "That does not look like a number.";
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
 * The server also sorts by shared trips first, so the people you have
 * travelled with most are at the top before anybody types anything.
 */
export function filterTripmates(
  tripmates: Tripmate[],
  query: string,
): Tripmate[] {
  const search = query.trim().toLowerCase();
  if (!search) return tripmates;

  return tripmates.filter((tripmate) =>
    tripmate.name.toLowerCase().startsWith(search),
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
    invited.push(formatPhone(phone));
  }

  return { invited, added, skipped };
}
