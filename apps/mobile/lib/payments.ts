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
import { wallClock, zoneOffsetMinutes } from "@/lib/timezone";
import { ledgerOrder, spreadShares } from "@journiful/shared/utils";
import type { SplitScope } from "@journiful/shared/utils";

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
 * A row being priced in the form: the amount, the people, and where it sits
 * in the trip's history.
 *
 * `id` and `createdAt` are what make a preview an **edit**. Without them the
 * row is new, and a new row is the last thing the trip has done — which is why
 * its `createdAt` defaults to a fixed instant after every stored row, not
 * `Date.now()`, so the preview cannot change under a device clock that
 * disagrees with the server's.
 */
export interface DraftSplit {
  amount: number;
  participantIds: readonly string[];
  /** The row being edited, so it replaces itself instead of doubling. */
  id?: string | null | undefined;
  createdAt?: string | null | undefined;
}

/** The id a draft is spread under when it is not yet a row. */
const DRAFT_ID = "draft-expense";

/** See `DraftSplit.createdAt`: later than any row that exists. */
const DRAFT_CREATED_AT = "9999-12-31T23:59:59.999Z";

/**
 * What each person on the draft will owe, once it is saved.
 *
 * The arithmetic is **not** restated here. `spreadShares`
 * (`shared/utils/split.ts`) is the one rule — the same function the API runs
 * over the trip's payments in `payment-split.ts` — so this is not a model of
 * the server's answer, it *is* the server's answer, over the trip the client
 * already holds. That is why the whole list comes in: a share is a fact about
 * the trip's history, not about one expense, and a preview computed from the
 * draft alone would disagree with the saved row by a cent on any trip whose
 * costs do not divide.
 *
 * Returns the draft's people in the order it was given them, which is the
 * order the form shows and the order a `custom` create sends. Order is not
 * load-bearing for the amount any more (the rule sorts), but it is what lines
 * these numbers up with the rows on screen.
 */
export function previewShares(
  existing: readonly Payment[],
  draft: DraftSplit,
): ScopedShare[] {
  const draftId = draft.id ?? DRAFT_ID;

  const steps = [
    ...existing
      .filter((payment) => payment.id !== draftId)
      .map((payment) => ({
        id: payment.id,
        amount: payment.amount,
        createdAt: payment.createdAt,
        participantIds: payment.participants.map(
          (participant) => participant.memberId,
        ),
      })),
    {
      id: draftId,
      amount: draft.amount,
      createdAt: draft.createdAt ?? DRAFT_CREATED_AT,
      participantIds: [...draft.participantIds],
    },
  ];

  const ordered = ledgerOrder(steps);
  const spreads = spreadShares(ordered);
  const at = ordered.findIndex((step) => step.id === draftId);
  const shares = spreads[at]?.shares ?? [];
  const participantIds = ordered[at]?.participantIds ?? [];

  return participantIds.map((memberId, index) => ({
    memberId,
    shareAmount: shares[index] ?? 0,
  }));
}

/**
 * A day the API will read back as that same day, anywhere.
 *
 * `lib/newStay.ts`'s `stamp` rule with the clock fixed at noon: the offset is
 * taken from the zone the day was read in, at noon on the day itself, so the
 * instant is the middle of that day rather than an edge of it. Noon because
 * the ledger reads the day back in the same zone (`paymentDay`) and a midnight
 * would be the day before for anybody far enough east.
 *
 * Here rather than in the form so the rule has one home with `paymentDay`,
 * which reads it back.
 */
export function paymentInstant(day: string, timeZone: string | null): string {
  const [year, month, date] = day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const offsetMinutes = zoneOffsetMinutes(timeZone, `${day}T12:00:00.000Z`);

  return new Date(
    Date.UTC(year, month - 1, date, 12, 0) - offsetMinutes * 60_000,
  ).toISOString();
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
