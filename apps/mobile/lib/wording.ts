/**
 * The words the app uses, in one place, because more than one screen
 * says them.
 *
 * Two things live here, both of them the sort of detail that drifts
 * silently: what a state is called, and how facts are joined.
 */

/**
 * A direction of travel nobody has filled in.
 *
 * Named once: the board's row and the form's summary were calling this
 * fact "No time yet" and "Not shared yet", and two names for one state
 * read as two states.
 *
 * "Not shared" over "No time" because it says whose move it is — the
 * member's — rather than describing the gap.
 */
export const NOT_SHARED = "Not shared yet";

/**
 * Facts on a line, joined.
 *
 * A middot joins separate facts — a day, a time, a place — and a comma
 * stays inside one: `Sep 18–26, 2026` is a single date, `Today · Sat Sep
 * 19` is a fact about which day and a fact about which date. Reading
 * down a boarding pass is the same bargain, and it is why a line of
 * them reads as a list rather than as a sentence.
 *
 * Empty parts drop out rather than leaving a stranded separator, so a
 * row with no place is two facts and not three with a gap.
 */
export function joinFacts(...parts: Array<string | null | undefined>): string {
  return parts.filter((part) => Boolean(part && part.trim())).join(" · ");
}
