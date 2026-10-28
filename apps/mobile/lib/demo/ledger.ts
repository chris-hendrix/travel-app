// The demo's ledger arithmetic: the reads, over the fixture rows
//
// The same computation the API does, on the demo's own store — a share is the
// trip's spread (`shared/utils/split.ts:spreadShares`, which is what
// `apps/api/src/services/payment-split.ts` runs), the net is "payer credited
// the whole amount, each participant debited their share", and the moves are
// the greedy simplification. Kept out of `money.ts` because that file is the
// fixtures and the HTTP handlers; this one is the arithmetic they both stand
// on, and it is pure over `DemoStore` so it reads on its own.
//
// The one rule the demo must not break: nothing here writes a share down. A
// stored row states who and how much the customer paid; what each person owes
// is computed on every read, exactly as the server does it, because a snapshot
// is what the product stopped keeping.
import { nowIso } from "@/lib/demo/store";
import type { DemoStore } from "@/lib/demo/store";
import {
  ledgerOrder,
  scopeMemberIds,
  spreadShares,
  withPayerFallback,
} from "@journiful/shared/utils";
import type {
  BalanceEntry,
  MemberWithProfile,
  MyBalanceDetail,
  Payment,
  PaymentParticipant,
} from "@journiful/shared/types";

/**
 * The trip's member rows: the only place a person's name comes from.
 *
 * The server's person map is built off the same rows — `loadTripSplits` reads
 * the roster once and both the names and the scopes come from it
 * (`payment-split.ts`), which is why this is the one lookup here and not two.
 */
export function rosterOf(store: DemoStore, tripId: string): MemberWithProfile[] {
  return store.members.get(tripId) ?? [];
}

/**
 * One member's name as the roster carries it, or `""`.
 *
 * A member id that is not on the trip has no name at all rather than an
 * invented one: the server joins names off the trip's members, so a
 * payment naming somebody else is a bug in the fixture, not a person to
 * make up.
 */
export function nameOfMember(roster: MemberWithProfile[], memberId: string): string {
  return roster.find((row) => row.id === memberId)?.displayName ?? "";
}

/**
 * One participant row: the member, the share the split rule gave them,
 * and the name off the roster (`payment.service.ts` joins the same name
 * onto every participant, so the split arrives with everything it draws).
 */
export function participantRow(
  paymentId: string,
  memberId: string,
  shareAmount: number,
  nameOf: (memberId: string) => string,
  index: number,
): PaymentParticipant {
  return {
    id: `${paymentId}-participant-${index + 1}`,
    paymentId,
    memberId,
    shareAmount,
    name: nameOf(memberId),
    createdAt: nowIso() as unknown as Date,
  };
}

/** The instant a demo row carries — the fixtures write ISO strings. */
function instantOf(value: unknown): string {
  return typeof value === "string"
    ? value
    : (value as Date).toISOString();
}

/**
 * The people on one stored row, as a read resolves them: a scope's are the
 * roster **now**, a custom row's exactly as it was written.
 *
 * This is where the demo would disagree with the product if it snapshotted a
 * rule. A rule is re-resolved on every read — the API stores `split_scope`
 * and no participant rows for it and resolves the roster in
 * `payment-split.ts` — so an RSVP that lands after the expense joins or leaves
 * the split with no edit to the row. Storing the people a rule resolved to
 * would freeze them, and the demo's roster **does** move: its own adapter
 * writes the viewer's answer on `POST /trips/:id/rsvp`.
 */
function peopleOf(store: DemoStore, row: Payment): string[] {
  if (row.splitScope === "custom") {
    return row.participants.map((participant) => participant.memberId);
  }
  const roster = rosterOf(store, row.tripId);
  return withPayerFallback(
    scopeMemberIds(row.splitScope, roster),
    row.payerMemberId,
  );
}

/**
 * Every stored row of one trip as a read serves it, with the **trip's**
 * spread applied — one computation for the list, the ledger and the detail,
 * because a share is a fact about the trip and not about the row.
 *
 * Mirrors `payment-split.ts:loadTripSplits`: chronological order
 * (`ledgerOrder`), each row's people resolved against the roster as it stands,
 * then one `spreadShares` over the lot. The stored rows are not modified —
 * this returns copies, and the store keeps exactly what a fixture wrote.
 */
export function rowsAsRead(store: DemoStore, tripId: string): Payment[] {
  const stored = store.payments.get(tripId) ?? [];
  if (stored.length === 0) return [];

  const people = new Map(
    stored.map((row) => [row.id, peopleOf(store, row)] as const),
  );
  const ordered = ledgerOrder(
    stored.map((row) => ({
      id: row.id,
      amount: row.amount,
      createdAt: instantOf(row.createdAt),
      participantIds: people.get(row.id) ?? [],
    })),
  );
  const spreads = spreadShares(ordered);

  const sharesById = new Map<string, number[]>();
  ordered.forEach((step, index) => {
    sharesById.set(step.id, spreads[index]?.shares ?? []);
  });

  const roster = rosterOf(store, tripId);
  const nameOf = (memberId: string) => nameOfMember(roster, memberId);

  return stored.map((row) => {
    const memberIds = people.get(row.id) ?? [];
    const shares = sharesById.get(row.id) ?? [];
    return {
      ...row,
      participants: memberIds.map((memberId, index) =>
        participantRow(row.id, memberId, shares[index] ?? 0, nameOf, index),
      ),
    };
  });
}

/** One row as a read serves it: the trip's read, narrowed to this row. */
export function rowAsRead(store: DemoStore, row: Payment): Payment {
  return (
    rowsAsRead(store, row.tripId).find((read) => read.id === row.id) ?? row
  );
}

/**
 * Every member's net position in cents over the trip's non-deleted
 * expenses: what they paid, minus what they owe.
 *
 * Mirrors `BalanceService.computeNetBalances`: the payer is credited the
 * whole amount, each participant is debited their own share, and the key
 * is the **member** id. Positive means owed money, negative means owing
 * it, and the map's total is always zero — every cent paid is a cent
 * somebody owes.
 *
 * Nothing is filtered: settle hard-deletes, so every stored row is a row the
 * server would return, and a delete moves the ledger by leaving the list.
 */
function netBalancesOf(store: DemoStore, tripId: string): Map<string, number> {
  const net = new Map<string, number>();
  // One trip read for the lot: the shares are the trip's spread, so they
  // cannot be computed a row at a time (`rowsAsRead`).
  for (const payment of rowsAsRead(store, tripId)) {
    net.set(
      payment.payerMemberId,
      (net.get(payment.payerMemberId) ?? 0) + payment.amount,
    );
    for (const participant of payment.participants) {
      net.set(
        participant.memberId,
        (net.get(participant.memberId) ?? 0) - participant.shareAmount,
      );
    }
  }
  return net;
}

/**
 * The trip's simplified moves, computed from the expenses on every read —
 * never stored, and never written down beside them, because a balance
 * written by hand contradicts the entries the moment either changes.
 *
 * Mirrors `BalanceService.simplifyDebts`: zero balances are dropped,
 * creditors and debtors are each sorted largest first, and the largest
 * creditor is repeatedly matched with the largest debtor for
 * `min(the two)`, until every balance is zero. The result is the shortest
 * set of moves that settles the trip — not one row per expense, which is
 * why the sheet can say who to pay rather than who paid what.
 *
 * The person ids here are **member** ids, the space `moveFor` and the
 * payer line substitute "You" in, and the names come off the roster.
 */
export function tripBalances(store: DemoStore, tripId: string): BalanceEntry[] {
  const roster = rosterOf(store, tripId);
  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  for (const [memberId, amount] of netBalancesOf(store, tripId)) {
    if (amount > 0) creditors.push({ id: memberId, amount });
    else if (amount < 0) debtors.push({ id: memberId, amount: -amount });
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const moves: BalanceEntry[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]!;
    const debtor = debtors[di]!;
    const transfer = Math.min(creditor.amount, debtor.amount);

    if (transfer > 0) {
      moves.push({
        from: { id: debtor.id, name: nameOfMember(roster, debtor.id) },
        to: { id: creditor.id, name: nameOfMember(roster, creditor.id) },
        amount: transfer,
      });
    }

    creditor.amount -= transfer;
    debtor.amount -= transfer;
    if (creditor.amount === 0) ci++;
    if (debtor.amount === 0) di++;
  }

  return moves;
}

/**
 * The reader's own position, read off the moves above — the second half
 * of `BalanceService.getMyBalance`, verbatim: a move they are the debtor
 * of is money they owe (a positive detail), a move they are the creditor
 * of is money owed to them (a negative one), and the net is the details'
 * own sum with the sign flipped.
 */
export function myBalanceOf(
  moves: BalanceEntry[],
  viewerMemberId: string,
): { netBalance: number; details: MyBalanceDetail[] } {
  let netBalance = 0;
  const details: MyBalanceDetail[] = [];

  for (const move of moves) {
    if (move.from.id === viewerMemberId) {
      netBalance -= move.amount;
      details.push({ person: move.to, amount: move.amount });
    } else if (move.to.id === viewerMemberId) {
      netBalance += move.amount;
      details.push({ person: move.from, amount: -move.amount });
    }
  }

  return { netBalance, details };
}

