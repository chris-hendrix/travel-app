/**
 * Money, in one place.
 *
 * The ledger is the first surface in the app that shows an amount the
 * reader typed, so it is the first place a float could get in. It does
 * not: every amount in this module is an integer count of cents, end to
 * end, and the only decimal point is the one printed for the reader.
 * `payments.amount` is already `integer` in the database for the same
 * reason (`apps/api/src/db/schema/index.ts`), and the API's own schema
 * refuses a non-integer (`shared/schemas/payment.ts`).
 *
 * This mirrors `lib/phone.ts`'s triple: one parser, one formatter, one
 * sentence explaining what is wrong with what was typed.
 */

/** $1,000,000.00. The API's own ceiling is permissive; this is the
 *  app's, and it exists so a slipped keypad cannot record a trip debt
 *  of a billion dollars. */
export const MAX_CENTS = 100_000_000;

/** The currency the whole surface is denominated in. `payments` has no
 *  currency column — see the plan's "Considered and cut". */
export const CURRENCY = "USD";

/**
 * Cents, or null while what is typed is not yet an amount.
 *
 * Deliberately tolerant of the shapes a person actually types — a
 * leading `$`, thousands separators, surrounding space, one or two
 * decimals — and deliberately intolerant of everything else. Three
 * decimals is null rather than rounded: silently dropping the third
 * decimal would record a different number than the one on screen, and
 * "12.345" is almost always a typo or a paste, not a request.
 *
 * Zero and negative are null: a payment of nothing is not a payment,
 * and the API rejects a non-positive amount anyway.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const [whole, fraction = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/**
 * The amount the way a person reads it ("$12.34"). Integer arithmetic
 * only — the division is on the cents and never produces a fraction,
 * because `Math.floor` and `%` are exact on integers.
 *
 * Negative formats with a leading minus, for the side of a balance that
 * is owed rather than owing.
 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const dollars = Math.floor(absolute / 100);
  const remainder = absolute % 100;

  return `${sign}$${dollars.toLocaleString("en-US")}.${String(remainder).padStart(2, "0")}`;
}

/**
 * Why an amount cannot be used yet, or nothing.
 *
 * Empty and malformed are different problems with different fixes, so
 * they are different sentences — the same call `phoneError` makes. Over
 * the cap is a third: the number is well-formed and still unusable.
 */
export function amountError(raw: string): string | undefined {
  if (raw.trim() === "") return "Enter an amount.";

  const cents = parseAmount(raw);
  if (cents === null) return "That does not look like an amount.";
  if (cents > MAX_CENTS) return "That is more than this trip can record.";

  return undefined;
}
