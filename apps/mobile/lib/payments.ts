/**
 * The ledger's own vocabulary: the shapes the money screens read, and
 * the pure functions that turn server truth into a sentence.
 *
 * No React and no fetch — node-importable like `lib/money.ts` and
 * `lib/mapping.ts`, so all of it is unit-testable in plain node (the
 * mobile suite has no renderer).
 *
 * Amounts here are integer cents, always. Formatting is `formatCents`'s
 * job, never this module's.
 */

import { formatCents } from "@/lib/money";
import { wallClock } from "@/lib/timezone";
import { equalShares, scopeMemberIds } from "@journiful/shared/utils";
import type { SplitMember, SplitScope } from "@journiful/shared/utils";

/**
 * The three ways a cost can be shared, re-exported from the shared rule
 * (`shared/utils/split.ts`) so no screen has to reach into the workspace
 * package to name one. `SPLIT_SCOPES` stays there: the form's control and
 * `SCOPE_LABEL` below are both derived from it.
 */
export type { SplitScope };

/**
 * What each scope is called, in the words the form shows.
 *
 * A record over `SplitScope` rather than a list, so a fourth scope in
 * `shared/utils/split.ts` fails to compile here instead of rendering
 * blank. The labels are the product's, not the column's: `custom` reads
 * as an invitation to pick people, which is what choosing it reveals.
 */
export const SCOPE_LABEL: Record<SplitScope, string> = {
  all_going: "Everyone going",
  all_invited: "Everyone invited",
  custom: "Choose people",
};

/** One person's share of a scoped split, in the order the scope resolved. */
export interface ScopedShare {
  /** A **member** id — the same space as `participants[].memberId`. */
  memberId: string;
  /** This person's share, in cents. The shares sum to the amount. */
  shareAmount: number;
}

/** Someone on one side of a balance — a member row, guest or not. */
export interface PaymentPerson {
  id: string;
  name: string;
}

/** One simplified move: `from` owes `to` this many cents. */
export interface BalanceMove {
  from: PaymentPerson;
  to: PaymentPerson;
  amount: number;
}

/** The reader's own position, as `/trips/:id/balances/me` returns it. */
export interface MyBalance {
  netBalance: number;
  details: { person: PaymentPerson; amount: number }[];
}

/** One person's share of an expense. */
export interface PaymentParticipant {
  /** Absent on a participant the server resolved from a split scope. */
  id?: string | undefined;
  memberId: string;
  name: string;
  /** This person's share, in cents, as the server computed it. */
  shareAmount: number;
}

/**
 * An expense, in the app's shape.
 *
 * Two id spaces live in here and they are not interchangeable:
 * `createdBy` is a **user** id (`payments.created_by` references
 * `users.id`), while `payerMemberId`, `participants[].memberId` and
 * every `PaymentPerson.id` are **member** ids. Comparing one to the
 * other is always a bug; `viewerOf` in `lib/members.ts` is what turns a
 * user id into the member row.
 */
export interface Payment {
  id: string;
  tripId: string;
  description: string;
  /** "how was it paid" — null when unset, which is different from "". */
  note: string | null;
  /** The whole expense, in cents. */
  amount: number;
  /**
   * How the cost is shared. Always present, because every row the app can
   * hold has one: the server's entity carries it (`payments.split_scope`
   * defaults to `custom`), the demo's fixtures are custom, and the
   * optimistic row the form paints is built from the request it is about
   * to send (`lib/queries/payments.ts`).
   */
  splitScope: SplitScope;
  payerMemberId: string;
  payerName: string;
  /** The day the expense belongs to, as an ISO instant (noon-anchored). */
  date: string;
  /** A **user** id. */
  createdBy: string;
  participants: PaymentParticipant[];
  createdAt: string;
  deletedAt: string | null;
}

/**
 * The order the ledger reads in: newest day first, and within a day the
 * most recently recorded first.
 *
 * The server supplies no order at all — `getPaymentsByTrip` has no
 * `ORDER BY`, so Postgres may hand back whatever it likes. This is the
 * only thing standing between the reader and that.
 *
 * `id` is the final tiebreak so the order is total and stable: two rows
 * with the same day and the same `created_at` must not swap places
 * between two renders of the same data.
 */
export function paymentsInOrder(payments: Payment[]): Payment[] {
  return [...payments].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/**
 * Each person's share of an equal split, in the order the ids are given.
 *
 * The arithmetic is **not** restated here. `equalShares`
 * (`shared/utils/split.ts`) is the one rule, applied by the API when it
 * records a split, by `splitForScope` below when the form previews a
 * scope, and by the demo — so the preview and the row it previews cannot
 * disagree. It is the largest-remainder rule: the integer division each,
 * and the leftover cents one each to the first `remainder` entries, not
 * all of them to the first. The two readings agree whenever the
 * remainder is 0 or 1, which is why the difference is easy to miss —
 * $100 between three is `[34, 33, 33]` either way, but $100.01 is
 * `[34, 34, 33]` here and `[35, 33, 33]` under the wrong one.
 *
 * The order is the caller's, and it is load-bearing: it decides who gets
 * the extra cent, and the form sends this same array in this same order.
 */
export function splitPreview(amount: number, memberIds: string[]): number[] {
  return equalShares(amount, memberIds.length);
}

/**
 * A scope, resolved against the roster and priced: who shares the cost
 * and what each of them owes, in member-id order.
 *
 * The client's half of the rule the API applies when it records a scoped
 * expense (`PaymentService` through `payment-split.ts`), over the same
 * two shared functions — `scopeMemberIds` for who, `equalShares` for how
 * much — so the form's previewed split and the row the server stores are
 * the same split. The roster arrives as the three facts the rule reads
 * (`SplitMember`), which the app's `Member` already is, so no screen has
 * to build a second shape.
 *
 * An empty answer is an answer: a roster where nobody is going resolves
 * to nobody, and the shares are `[]`. The floor that keeps a split from
 * being empty is the shared `withPayerFallback` (D5): a create is refused
 * because the API refuses it too, while an edit shows the payer owing the
 * lot, because that is what the server stores and reads back. Either way
 * the screen is what says why the rows are empty (`emptyScopeSentence`)
 * rather than this function inventing a participant.
 */
export function splitForScope(
  scope: SplitScope,
  members: readonly SplitMember[],
  amount: number,
): ScopedShare[] {
  const memberIds = scopeMemberIds(scope, members);
  const shares = equalShares(amount, memberIds.length);

  return memberIds.map((memberId, index) => ({
    memberId,
    shareAmount: shares[index] ?? 0,
  }));
}

/**
 * Why a rule can draw nobody, said where its rows would be.
 *
 * The scope still works as an answer — the trip fills up and the split
 * follows — so the form does not take the option away. It says what the rule
 * resolved to instead, because a body that draws no rows and refuses the save
 * is a form that looks broken rather than a trip that has no answers yet.
 *
 * Two sentences rather than one, because the two rules empty out for
 * different reasons: `Everyone going` waits on an answer, `Everyone invited`
 * waits on a roster. One shape, two nouns, so the pair reads as the same
 * statement twice rather than two messages. (`Choose people` never draws
 * this: an empty fixed list is the boxes nobody ticked, which is the form's
 * own message to give.)
 */
export function emptyScopeSentence(scope: SplitScope): string {
  return scope === "all_invited"
    ? "Nobody is on the trip yet, so there is no one to share it with."
    : "Nobody is going yet, so there is no one to share it with.";
}

/**
 * The day an expense belongs to, read in the zone it was stamped in.
 *
 * `payments.date` is an instant, noon-anchored when the form built it
 * (`lib/newStay.ts`'s `stamp` rule). Reading it back in the same zone is
 * what makes the day round-trip; reading it in another would move a
 * dinner to the wrong day for anyone far enough east or west. A null
 * zone means the device's own.
 */
export function paymentDay(payment: Payment, timeZone: string | null): string {
  return wallClock(payment.date, timeZone).date;
}

/**
 * The ledger's headline: the reader's own net position.
 *
 * A settled trip says so rather than "$0.00" — a zero dressed as money
 * reads like a debt that happens to be nothing.
 */
export function positionFor(netBalance: number): string {
  if (netBalance === 0) return "You are settled up";
  return netBalance > 0
    ? `You are owed ${formatCents(netBalance)}`
    : `You owe ${formatCents(-netBalance)}`;
}

/**
 * The move a settle-up link points at, or null when the ledger no longer
 * has one.
 *
 * The amount is the **move's**, never the URL's: a stale number in a link
 * is a lie about what is owed, and the ledger is what actually knows. A
 * move that has gone answers null so the form can say so rather than
 * offering to record a payment against arithmetic that no longer holds.
 *
 * The two ids are **member** ids — the same space as `move.from.id`.
 */
export function findMove(
  moves: BalanceMove[],
  fromMemberId: string | null,
  toMemberId: string | null,
): BalanceMove | null {
  if (!fromMemberId || !toMemberId) return null;

  return (
    moves.find(
      (move) =>
        move.from.id === fromMemberId && move.to.id === toMemberId,
    ) ?? null
  );
}

/**
 * One simplified move, told from the reader's side.
 *
 * Their own member id reads as "You", in whichever position it sits; a
 * move between two other people names both. The substitution is on
 * **member** ids — the same space as `entry.from.id`, never a user id.
 */
export function moveFor(move: BalanceMove, viewerMemberId: string): string {
  const amount = formatCents(move.amount);

  if (move.from.id === viewerMemberId) {
    return `You owe ${move.to.name} ${amount}`;
  }
  if (move.to.id === viewerMemberId) {
    return `${move.from.name} owes you ${amount}`;
  }
  return `${move.from.name} owes ${move.to.name} ${amount}`;
}
