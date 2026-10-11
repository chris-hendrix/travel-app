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
  id: string;
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
 * The server's rule, mirrored exactly
 * (`PaymentService.computeEqualShares`): every share is the integer
 * division, and the remainder cents go **one each to the first
 * `remainder` participants** — not all of them to the first. The two
 * readings agree whenever the remainder is 0 or 1, which is why the
 * difference is easy to miss: $100 between three people is `[34, 33,
 * 33]` either way, but $100.01 between three is `[34, 34, 33]` here and
 * `[35, 33, 33]` under the wrong one. A preview that used any other
 * order — or that piled the remainder on the first — would be a lie
 * about the row the reader is about to write, so the form sends this
 * same array in this same order.
 */
export function splitPreview(amount: number, memberIds: string[]): number[] {
  if (memberIds.length === 0) return [];

  const base = Math.floor(amount / memberIds.length);
  const remainder = amount - base * memberIds.length;

  return memberIds.map((_, index) => (index < remainder ? base + 1 : base));
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
