// Taking a member off a trip, and taking them out of the money
//
// Four paths delete a member row — `removeMember` (organizer, by member id),
// `deleteGuest`, `removeCoOrganizer`, and (until this change) `revokeInvitation`
// — and every one of them used to consult `payment_participants` only to
// refuse. That was the FK talking: `payments.member_id` and
// `payment_participants.member_id` are both `ON DELETE RESTRICT`, so a member
// who owed a share of a group dinner could not leave the trip at all. It also
// meant `revokeInvitation`, which had no pre-check, surfaced a raw FK 500.
//
// D4 splits the two relations apart, which is why there is exactly one guard
// and one cascade here rather than a rule per path:
//
// - **A payer is refused** (`assertNoPaidExpenses`). The money they spent is
//   somebody else's record too, and there is no honest reassignment we can
//   guess at — the 409 names the reason and the organizer decides.
// - **A participant is not.** They leave the group cost, their row goes, and
//   the people still on the trip share it instead. Refusing here would have
//   made every member unremovable once a group expense existed.
//
// Both run inside the caller's transaction (`tx`), never on `db`: the member
// row, the participant rows and the re-split shares have to land together, and
// the payer guard has to read the same snapshot the delete is about to act on.
import { eq } from "drizzle-orm";
import { equalShares } from "@journiful/shared/utils";
import { payments, paymentParticipants } from "@/db/schema/index.js";
import type { AppDatabase } from "@/types/index.js";
import { MemberHasPaymentsError } from "../errors.js";

/**
 * The executor these helpers need — `db` or, preferably, the caller's
 * transaction. Nothing here reads a member's own row: the caller has already
 * loaded it (and its name, its phone, its guest-ness) to decide *whom* it is
 * removing.
 */
export type RemovalExecutor = Pick<
  AppDatabase,
  "select" | "insert" | "update" | "delete"
>;

/**
 * One of the `@fastify/error` factories: a constructor taking the message.
 * Passed in because the guest path has its own code — `GUEST_HAS_PAYMENTS`
 * — and the client's copy differs ("This guest paid for an expense…").
 */
export type RemovalErrorClass = new (message: string) => Error;

const MEMBER_HAS_PAYMENTS =
  "Member has payments — reassign or delete them first";

/**
 * Refuse the removal when the member paid for any expense.
 *
 * Soft-deleted payments count: the RESTRICT FK applies regardless of
 * `deleted_at`, so a restored expense would otherwise hit it later. (A
 * participant's own rows are *not* a reason to refuse — see
 * `cascadeMemberRemoval`.)
 */
export async function assertNoPaidExpenses(
  tx: RemovalExecutor,
  memberId: string,
  ErrorClass: RemovalErrorClass = MemberHasPaymentsError,
  message: string = MEMBER_HAS_PAYMENTS,
): Promise<void> {
  const [paidRow] = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.memberId, memberId))
    .limit(1);

  if (paidRow) {
    throw new ErrorClass(message);
  }
}

/**
 * Take the member out of every split they are only a participant of: their
 * rows go, the remaining rows are re-shared, and a payment left with nobody
 * falls back to the payer.
 *
 * The re-share is **not** what anyone reads — shares are the trip-wide spread
 * (`shared/utils/split.ts:spreadShares`, applied by `payment-split.ts` on every
 * read), so the ledger already follows the trip. It maintains
 * `share_amount`, which only the *previous* release reads
 * (`payment_participants`' table comment): leaving it stale would make a
 * rollback show wrong numbers for a payment somebody just left.
 *
 * Scoped payments (`split_scope <> 'custom'`) hold no rows, so they are
 * untouched here — the roster is the split, and the next read of the scope
 * simply no longer includes the member.
 */
export async function cascadeMemberRemoval(
  tx: RemovalExecutor,
  memberId: string,
): Promise<void> {
  const ownRows = await tx
    .select({ paymentId: paymentParticipants.paymentId })
    .from(paymentParticipants)
    .where(eq(paymentParticipants.memberId, memberId));

  const affectedPaymentIds = [...new Set(ownRows.map((row) => row.paymentId))];
  if (affectedPaymentIds.length === 0) return;

  await tx
    .delete(paymentParticipants)
    .where(eq(paymentParticipants.memberId, memberId));

  for (const paymentId of affectedPaymentIds) {
    await resplitRemainingRows(tx, paymentId);
  }
}

/**
 * Re-share one payment's remaining rows, or hand it to the payer.
 *
 * The amounts are the previous release's (`payment_participants`' table
 * comment): `equalShares` in `(createdAt, id)` order, so the member who has
 * been in the split longest keeps the odd cent — the same rule as a fresh
 * create, applied to a shrunken list, which is what that image expects to read.
 */
async function resplitRemainingRows(
  tx: RemovalExecutor,
  paymentId: string,
): Promise<void> {
  const [payment] = await tx
    .select({ amount: payments.amount, memberId: payments.memberId })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);

  // The payment row is gone (cascade delete raced the removal) — nothing to
  // re-share, and nothing to resurrect.
  if (!payment) return;

  const remaining = await tx
    .select({
      id: paymentParticipants.id,
      shareAmount: paymentParticipants.shareAmount,
    })
    .from(paymentParticipants)
    .where(eq(paymentParticipants.paymentId, paymentId))
    .orderBy(paymentParticipants.createdAt, paymentParticipants.id);

  if (remaining.length === 0) {
    await tx.insert(paymentParticipants).values({
      paymentId,
      memberId: payment.memberId,
      shareAmount: payment.amount,
    });
    return;
  }

  const shares = equalShares(payment.amount, remaining.length);
  for (const [index, row] of remaining.entries()) {
    const shareAmount = shares[index]!;
    if (row.shareAmount === shareAmount) continue;
    await tx
      .update(paymentParticipants)
      .set({ shareAmount })
      .where(eq(paymentParticipants.id, row.id));
  }
}
