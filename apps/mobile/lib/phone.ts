import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

/**
 * Numbers, in one place.
 *
 * The app had two opinions about a phone number: the invite dialog
 * stripped it by hand and demanded a country code, and the sign-in
 * screen parsed it properly. That is not only untidy, it was a real
 * gap: you could sign up with a UK number and then not invite one,
 * because the invite field insisted on +1.
 *
 * The metadata is the `/min` build: parsing, validation and formatting
 * for every country, without the carrier and timezone tables nothing
 * here reads.
 */

/** Whose country a bare number is read in. A leading + overrides it. */
const HOME_COUNTRY: CountryCode = "US";

/**
 * The parse, when what is typed looks like a number at all.
 *
 * `isPossible`, not `isValid`. libphonenumber is quite right that
 * +1 555 000 0001 is not a real number: 555 is not an assigned area
 * code, and this project signs in and invites with exactly that shape.
 * Validity would reject every test credential in the repo, and the API
 * is the authority on it anyway (it validates E.164, and in dev it lets
 * the 555 range through). What a field owes the reader is "that looks
 * like a number", and possible is what says so. A seven-digit local
 * number is still too short, and still refused.
 */
function parse(value: string) {
  const parsed = parsePhoneNumberFromString(value, HOME_COUNTRY);
  return parsed?.isPossible() ? parsed : null;
}

/** E.164, or null while what is typed is not yet a number. */
export function toE164(value: string): string | null {
  return parse(value)?.number ?? null;
}

/** The number the way a person writes it, for reading back to them
 *  ("+1 555 000 0001"). Anything unparseable comes back as it was
 *  typed, since that is still what they need to see. */
export function formatPhoneForDisplay(value: string): string {
  return parse(value)?.formatInternational() ?? value;
}

/**
 * Why a number cannot be used yet, or nothing.
 *
 * Empty and malformed are different problems with different fixes, so
 * they are different sentences. A missing country code is deliberately
 * not one of them any more: a bare ten-digit number is read as home,
 * and asking somebody to add "+1" to a number they are holding in their
 * hand is a rule with nothing behind it.
 */
export function phoneError(raw: string): string | undefined {
  if (raw.trim().replace(/\D/g, "").length < 2) return "Enter a number.";
  return toE164(raw) ? undefined : "That does not look like a number.";
}
