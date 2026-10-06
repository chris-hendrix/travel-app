/**
 * The moderation vocabulary, and the sentences the roster row's panel
 * says about it.
 *
 * Node-importable by design: no `react`, no `react-native`, no fetch.
 *
 * **The four reasons are not restated here.** `REPORT_REASONS` is
 * re-exported from `shared/schemas/moderation.ts`, which is the one place
 * they exist and the same list `reportUserSchema` validates against, so a
 * fifth reason added there reaches this screen without a second edit. What
 * lives here is the mobile layer's half: saying them, the note's cap, and
 * which row may be moderated at all.
 *
 * The labels moved here from `lib/admin.ts` when the roster row became
 * their second caller. Two maps for one vocabulary is two places to
 * drift, and one vocabulary with one label map is the whole reason the
 * values live in `shared` in the first place.
 */

import { REPORT_REASONS } from "@journiful/shared/schemas";
import type { ReportReason } from "@journiful/shared/schemas";
import type { RosterRow } from "@/lib/roster";
import { toErrorCopy } from "@/lib/queries/errors";

export { REPORT_REASONS, type ReportReason };

/**
 * The labels for the reason vocabulary, in `REPORT_REASONS`'s own order,
 * so a list of reasons reads the same here and anywhere else it is drawn.
 * Every value in the vocabulary has one; the test iterates the
 * vocabulary rather than a list typed into the test, so a reason that
 * arrives without a label fails rather than renders blank.
 */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Harassment",
  impersonation: "Impersonation",
  other: "Something else",
};

/** One reason, as the screen says it. */
export function reportReasonLabel(reason: ReportReason): string {
  return REPORT_REASON_LABELS[reason];
}

/**
 * The note's cap, in characters — `reportUserSchema`'s own
 * `z.string().max(500)`. The field stops the writer at the same number the
 * server would refuse, so a note this app accepted is never rejected for
 * its length, and the counter under the field and the field's own limit
 * cannot disagree. `__tests__/moderation.test.ts` pins it by parsing the
 * shared schema rather than by repeating the number here.
 */
export const REPORT_NOTE_MAX = 500;

/** The two things the panel can do, which are not one thing. */
export type ModerationAction = "report" | "block";

/**
 * Who a row lets you moderate: the account behind it, or nobody.
 *
 * One decision, in one pure place, so it is testable without a renderer
 * and the row is not left spending its own condition on it. Three rows
 * answer `null`:
 *
 * - an `invited` row has no account at all — an invitation is a phone
 *   number, not a person to block;
 * - a guest row's `userId` is null for the same reason (`guest` is that
 *   same fact read off the member, so this reads the account and not the
 *   flag);
 * - your own row: you cannot report or block yourself, and the API
 *   refuses it, so the control is not offered rather than answered with
 *   a 4xx.
 *
 * An unknown viewer (`viewerId` undefined) moderates every account with a
 * user behind it, since nothing matches an absent id.
 */
export function moderatableUserId(
  row: RosterRow,
  viewerId: string | undefined,
): string | null {
  if (row.kind !== "person") return null;
  const account = row.member.userId;
  if (account === null || account === viewerId) return null;
  return account;
}

/**
 * The in-flight label for a panel button — the `pendingLabel` idiom from
 * `lib/admin.ts`, held here so the two words are a value rather than two
 * ternaries in a screen. The label changes only while the write is in
 * flight, so the thumb that pressed it does not have to find a new word.
 */
export function moderationPendingLabel(action: ModerationAction): string {
  return action === "report" ? "Reporting…" : "Blocking…";
}

/**
 * What the panel says when a write fails: the caller's sentence about
 * what failed, read off the error the way every other screen reads it
 * (`toErrorCopy`), with the offline case named outright because a request
 * that never arrived is not the server's answer.
 *
 * A `404` is the one status `toErrorCopy` passes through with no message
 * at all (nothing was there to fail), so it lands on the action's own
 * sentence — the same fallback `removeTrip` uses in `app/trips/edit.tsx`.
 */
export function moderationFailureCopy(
  caught: unknown,
  action: ModerationAction,
): string {
  const copy = toErrorCopy(caught);
  if (copy.offline) {
    return "You're offline. Check your connection and try again.";
  }
  const fallback =
    action === "report" ? "Couldn't send the report." : "Couldn't block them.";
  return copy.message ?? fallback;
}

/**
 * What the panel leaves behind after a report: a report changes nothing
 * visible about the roster, so silence where the panel was would read as
 * failure. One quiet line, in the app's own words, saying what happened
 * and who reads it.
 */
export const REPORT_RECORDED_COPY = "Thanks. An admin will look at this.";
