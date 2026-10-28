// The split, resolved against the trip's roster — and against the trip
//
// A payment records *how* it is shared (`payments.split_scope`), not only
// *among whom*: `custom` stores a fixed list in `payment_participants`, while
// `all_going` and `all_invited` store no rows at all and are re-resolved here
// on every read. That is half the design — a member added after the expense
// joins a shared cost, and a member removed leaves it, with no edit per
// expense and no sync path to drift.
//
// The other half is that **shares are a trip-wide fact**. A cost's amount does
// not divide by its participants, so every cost rounds, and rounding each one
// on its own hands the stray cents to the same seats until the per-person
// totals drift apart (`shared/utils/split.ts:spreadShares` explains, and
// measures, why that was the bug). So nothing here computes a share in
// isolation: `loadTripSplits` resolves every payment's people, spreads the
// leftovers over the trip in `ledgerOrder`, and everything that shows or sums
// money reads its numbers from that one call — the payment list, the payment
// detail, a write's response, and the ledger. They cannot disagree, because
// there is only one computation.
//
// The rule itself lives in `shared/utils/split.ts` (`scopeMemberIds` for who,
// `spreadShares` for how much) and is used by the API, the form preview and
// the demo alike.
import { eq, inArray, sql } from "drizzle-orm";
import {
  ledgerOrder,
  scopeMemberIds,
  spreadShares,
  withPayerFallback,
  type MemberRsvpStatus,
  type SplitScope,
} from "@journiful/shared/utils";
import {
  members,
  paymentParticipants,
  payments,
  users,
  type Payment,
} from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";

/** The part of the executor a roster read needs — `db` or a caller's `tx`. */
type SplitDb = Pick<AppDatabase, "select">;

/**
 * A roster row reduced to what a split needs: the three facts the rule reads
 * plus the display name, so the caller never needs a second lookup to answer
 * "who is in this split?".
 */
export interface SplitRosterMember {
  id: string;
  status: MemberRsvpStatus;
  userId: string | null;
  name: string;
}

/**
 * One resolved participant, shaped like the row view the API returns.
 *
 * `id`, `paymentId` and `createdAt` are present only when a stored
 * `payment_participants` row produced the person — a `custom` split has rows,
 * a scoped one has none, and a resolved participant is a fact about the roster
 * rather than a record of its own. `shareAmount` is never read back from the
 * row: it is the spread's answer, so a stored number cannot outlive the trip
 * it was rounded in.
 */
export interface ResolvedParticipant {
  id?: string;
  paymentId?: string;
  memberId: string;
  shareAmount: number;
  name: string;
  createdAt?: Date;
}

/**
 * A whole trip's splits: the roster that resolved them, the payments in
 * ledger order, and each payment's participants keyed by payment id.
 */
export interface TripSplits {
  roster: SplitRosterMember[];
  /** Every payment row, in the order the query returned them (not ledger order). */
  payments: Payment[];
  participants: Map<string, ResolvedParticipant[]>;
}

/**
 * The other members of a trip, loaded once per call.
 *
 * Ordered by id, so the roster is the same list no matter what Postgres
 * returns and the shares below follow `scopeMemberIds`' order without a
 * second sort. `name` is the same coalesce the ledger uses: an account's
 * display name, else the organizer's label for a guest.
 */
export async function loadSplitMembers(
  db: SplitDb,
  tripId: string,
): Promise<SplitRosterMember[]> {
  const rows = await db
    .select({
      id: members.id,
      status: members.status,
      userId: members.userId,
      name: sql<string>`coalesce(${users.displayName}, ${members.guestDisplayName}, 'Unknown')`,
    })
    .from(members)
    .leftJoin(users, eq(members.userId, users.id))
    .where(eq(members.tripId, tripId))
    .orderBy(members.id);

  return rows;
}

/**
 * Read a stored `split_scope` back as the union.
 *
 * The column is a `varchar` with a CHECK, so the type Postgres hands back is
 * `string`. Anything that is not one of the two roster scopes reads as
 * `custom`, which is both the column default and the only scope whose rows the
 * read paths know how to trust — so a row that slipped past the CHECK still
 * reads as the snapshot it most nearly is rather than throwing on a list read.
 */
export function asSplitScope(value: string): SplitScope {
  return value === "all_going" || value === "all_invited" ? value : "custom";
}

/**
 * Every payment's split for one trip, resolved once.
 *
 * One roster read, one payments read, one participant read, one spread. The
 * result is what the ledger, the list, the detail and a write's response all
 * report, which is the point: a share is a fact about the trip's history, so
 * any surface that computed it alone could disagree with the others by a cent.
 *
 * `custom` takes its people from its rows and a scope takes them from the
 * roster. Both then go through `withPayerFallback`, so a split whose people
 * have all left reads as the payer alone rather than as a payment credited to
 * nobody (see that function for why an empty split cannot be empty).
 */
export async function loadTripSplits(
  db: SplitDb,
  tripId: string,
): Promise<TripSplits> {
  const [roster, paymentRows] = await Promise.all([
    loadSplitMembers(db, tripId),
    db.select().from(payments).where(eq(payments.tripId, tripId)),
  ]);

  if (paymentRows.length === 0) {
    return { roster, payments: [], participants: new Map() };
  }

  const nameById = new Map(roster.map((member) => [member.id, member.name]));

  // Only a `custom` payment has rows. Filtering the read by scope keeps a
  // stray row on a scoped payment from widening its split: the scope is the
  // record there, and the row would be the artifact of a half-done switch.
  const customPaymentIds = paymentRows
    .filter((payment) => asSplitScope(payment.splitScope) === "custom")
    .map((payment) => payment.id);

  const storedRows =
    customPaymentIds.length > 0
      ? await db
          .select({
            id: paymentParticipants.id,
            paymentId: paymentParticipants.paymentId,
            memberId: paymentParticipants.memberId,
            createdAt: paymentParticipants.createdAt,
          })
          .from(paymentParticipants)
          .where(inArray(paymentParticipants.paymentId, customPaymentIds))
      : [];

  const storedByPayment = new Map<string, typeof storedRows>();
  for (const row of storedRows) {
    const list = storedByPayment.get(row.paymentId) ?? [];
    list.push(row);
    storedByPayment.set(row.paymentId, list);
  }

  // The spread's input: recorded order (`ledgerOrder`), and each payment's
  // people in member-id order so the run depends on the trip and not on a
  // query's row order.
  const steps = ledgerOrder(
    paymentRows.map((payment) => ({
      ...payment,
      createdAt: payment.createdAt.toISOString(),
    })),
  ).map((payment) => {
    const scope = asSplitScope(payment.splitScope);
    const stored = scope === "custom" ? (storedByPayment.get(payment.id) ?? []) : [];
    const listed =
      scope === "custom"
        ? stored.map((row) => row.memberId)
        : scopeMemberIds(scope, roster);

    // A duplicate row would charge one person twice; the write path refuses
    // one, and this keeps a stray from doubling a share here.
    const unique = [...new Set(listed)].sort();
    const rowByMember = new Map(stored.map((row) => [row.memberId, row]));

    return {
      id: payment.id,
      amount: payment.amount,
      payerMemberId: payment.memberId,
      participantIds: withPayerFallback(unique, payment.memberId),
      rowByMember,
    };
  });

  const spreads = spreadShares(
    steps.map((step) => ({
      id: step.id,
      amount: step.amount,
      participantIds: step.participantIds,
    })),
  );

  const participants = new Map<string, ResolvedParticipant[]>();
  steps.forEach((step, index) => {
    const spread = spreads[index]!;
    participants.set(
      step.id,
      step.participantIds.map((memberId, position) => {
        const row = step.rowByMember.get(memberId);
        return {
          ...(row
            ? { id: row.id, paymentId: row.paymentId, createdAt: row.createdAt }
            : {}),
          memberId,
          shareAmount: spread.shares[position]!,
          name: nameById.get(memberId) ?? "Unknown",
        };
      }),
    );
  });

  return {
    roster,
    payments: paymentRows,
    participants,
  };
}
