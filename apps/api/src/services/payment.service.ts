import {
  payments,
  paymentParticipants,
  members,
  type Payment,
} from "@/db/schema/index.js";
import { eq, and, inArray } from "drizzle-orm";
import { scopeMemberIds, type SplitScope } from "@journiful/shared/utils";
import type {
  CreatePaymentInput,
  UpdatePaymentInput,
} from "@journiful/shared/schemas";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import {
  asSplitScope,
  loadSplitMembers,
  loadTripSplits,
} from "./payment-split.js";
import {
  PaymentNotFoundError,
  PaymentMemberNotInTripError,
  DuplicateParticipantError,
  PermissionDeniedError,
  EmptySplitError,
} from "../errors.js";

/**
 * A participant as the service returns it.
 *
 * `id`, `paymentId` and `createdAt` are absent on a participant resolved from
 * a split scope: a scope stores no rows, so the person is a fact about the
 * roster rather than a record of its own. `ResolvedParticipant` is the arm
 * that carries no row.
 */
interface PaymentParticipantView {
  id?: string;
  paymentId?: string;
  memberId: string;
  shareAmount: number;
  name?: string;
  createdAt?: Date;
}

interface PaymentWithParticipants extends Payment {
  payerMemberId: string;
  payerName?: string;
  participants: PaymentParticipantView[];
}

export interface IPaymentService {
  createPayment(
    userId: string,
    tripId: string,
    data: CreatePaymentInput,
  ): Promise<PaymentWithParticipants>;

  getPaymentsByTrip(
    userId: string,
    tripId: string,
  ): Promise<PaymentWithParticipants[]>;

  updatePayment(
    userId: string,
    paymentId: string,
    data: UpdatePaymentInput,
  ): Promise<PaymentWithParticipants>;

  deletePayment(userId: string, paymentId: string): Promise<void>;
}

export class PaymentService implements IPaymentService {
  constructor(
    private db: AppDatabase,
    private permissionsService: IPermissionsService,
  ) {}

  async createPayment(
    userId: string,
    tripId: string,
    data: CreatePaymentInput,
  ): Promise<PaymentWithParticipants> {
    const isMember = await this.permissionsService.isMember(userId, tripId);
    if (!isMember) {
      throw new PermissionDeniedError(
        "Permission denied: only trip members can create payments",
      );
    }

    // Which split this is. Absent means `custom`, the column default, so an
    // older client that knows nothing of scopes keeps filing the snapshot it
    // always filed.
    const scope: SplitScope = data.splitScope ?? "custom";

    if (scope !== "custom") {
      // A scoped split needs no membership check of its participants — they
      // come from the trip's own roster, so they are members by construction —
      // but a scope says nothing about who paid, so the payer is checked alone.
      await this.assertMembersInTrip(tripId, [data.payerMemberId]);
      return this.createScopedPayment(userId, tripId, data, scope);
    }

    const participants = data.participants ?? [];

    // Validate the payer and the participants belong to this trip in one query.
    // Guests are allowed — the organizer records who paid; `createdBy` stays
    // the recording user.
    const participantMemberIds = participants.map((p) => p.memberId);
    this.assertNoDuplicateParticipants(participantMemberIds);
    await this.assertMembersInTrip(tripId, [
      data.payerMemberId,
      ...participantMemberIds,
    ]);

    // Shares are not computed here: a share depends on the rest of the trip
    // (`loadTripSplits`), so the only thing a write stores is who is in the
    // split. `enrichPayment` below reads the spread back, which is what makes
    // a write's response identical to a later read's.

    // Payment + participants insert atomically: a participants-insert
    // failure must not leave an orphan payment row.
    const { payment } = await this.db.transaction(
      async (tx) => {
        const [payment] = await tx
          .insert(payments)
          .values({
            tripId,
            description: data.description,
            note: data.note ?? null,
            amount: data.amount,
            splitScope: "custom",
            memberId: data.payerMemberId,
            date: data.date ? new Date(data.date) : new Date(),
            createdBy: userId,
          })
          .returning();

        if (!payment) {
          throw new Error("Failed to create payment");
        }

        await tx.insert(paymentParticipants).values(
          participants.map((p) => ({
            paymentId: payment.id,
            memberId: p.memberId,
          })),
        );
        return { payment };
      },
    );

    return this.enrichPayment(tripId, payment);
  }

  /**
   * A scoped create: the rule is resolved against the roster now, so an empty
   * split is refused here (the read path falls back to the payer instead, see
   * `payment-split.ts`), and no participant rows are written — the scope is
   * the record, and the next read resolves it again.
   */
  private async createScopedPayment(
    userId: string,
    tripId: string,
    data: CreatePaymentInput,
    scope: Exclude<SplitScope, "custom">,
  ): Promise<PaymentWithParticipants> {
    const roster = await loadSplitMembers(this.db, tripId);

    if (scopeMemberIds(scope, roster).length === 0) {
      // The same two sentences the form writes when a rule draws nobody
      // (`lib/payments.ts:emptyScopeSentence`), so the refusal reads as one
      // statement whether it arrives from the screen or from here. No em
      // dash: these are user-facing copy if the app ever surfaces an API
      // error (`apps/mobile/AGENTS.md`).
      throw new EmptySplitError(
        scope === "all_going"
          ? "Nobody is going yet, so there is no one to share it with."
          : "Nobody is on the trip yet, so there is no one to share it with.",
      );
    }

    const [payment] = await this.db
      .insert(payments)
      .values({
        tripId,
        description: data.description,
        note: data.note ?? null,
        amount: data.amount,
        splitScope: scope,
        memberId: data.payerMemberId,
        date: data.date ? new Date(data.date) : new Date(),
        createdBy: userId,
      })
      .returning();

    if (!payment) {
      throw new Error("Failed to create payment");
    }

    return this.enrichPayment(tripId, payment);
  }

  async getPaymentsByTrip(
    userId: string,
    tripId: string,
  ): Promise<PaymentWithParticipants[]> {
    await this.assertMember(userId, tripId);

    // One call resolves the roster and every payment's split together — a
    // scope is re-resolved per read, and a share is a fact about the trip's
    // history, so this *is* the read. A member added since a payment was filed
    // is in it, one removed is not, and the leftover cents are already spread.
    const {
      roster,
      payments: paymentRows,
      participants,
    } = await loadTripSplits(this.db, tripId);

    if (paymentRows.length === 0) return [];

    const nameById = new Map(roster.map((member) => [member.id, member.name]));

    return paymentRows.map((p) => ({
      ...p,
      splitScope: asSplitScope(p.splitScope),
      payerMemberId: p.memberId,
      payerName: nameById.get(p.memberId) ?? "Unknown",
      participants: participants.get(p.id) ?? [],
    }));
  }

  async updatePayment(
    userId: string,
    paymentId: string,
    data: UpdatePaymentInput,
  ): Promise<PaymentWithParticipants> {
    const [existing] = await this.db
      .select({
        id: payments.id,
        tripId: payments.tripId,
        createdBy: payments.createdBy,
        amount: payments.amount,
        splitScope: payments.splitScope,
      })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!existing) {
      throw new PaymentNotFoundError();
    }

    const canModify = await this.canModifyPayment(userId, existing);
    if (!canModify) {
      throw new PermissionDeniedError(
        "Permission denied: only payment creator or organizers can edit payments",
      );
    }

    if (data.payerMemberId !== undefined) {
      await this.assertMembersInTrip(existing.tripId, [data.payerMemberId]);
    }
    if (data.participants !== undefined) {
      this.assertNoDuplicateParticipants(
        data.participants.map((p) => p.memberId),
      );
      await this.assertMembersInTrip(
        existing.tripId,
        data.participants.map((p) => p.memberId),
      );
    }

    // What this row's split is once the update lands. A participant list means
    // a custom split — the schema refuses a list beside a scope, so the two
    // cannot disagree. A non-custom scope means the rows go. Neither field
    // means the split is left alone (schema 400s on a bare `custom`).
    const nextScope: SplitScope =
      data.participants !== undefined
        ? "custom"
        : (data.splitScope ?? asSplitScope(existing.splitScope));
    const splitExpressed =
      data.participants !== undefined || data.splitScope !== undefined;

    // Build update data
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.description !== undefined) updateData.description = data.description;
    if (data.note !== undefined) updateData.note = data.note;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.payerMemberId !== undefined)
      updateData.memberId = data.payerMemberId;
    if (data.date !== undefined) updateData.date = new Date(data.date);
    if (splitExpressed) updateData.splitScope = nextScope;

    const [updated] = await this.db
      .update(payments)
      .set(updateData)
      .where(eq(payments.id, paymentId))
      .returning();

    if (!updated) {
      throw new PaymentNotFoundError();
    }

    await this.writeSplitForUpdate(paymentId, nextScope, data);

    return this.enrichPayment(existing.tripId, updated);
  }

  /**
   * Bring `payment_participants` in line with the split the update asked for.
   *
   * The invariant is one line — `custom` has rows, a scope has none — and the
   * rows are now **only the list of people**: the shares are the trip's spread
   * (`loadTripSplits`), recomputed on every read, so nothing here has an
   * amount to write and an amount change has nothing to update.
   */
  private async writeSplitForUpdate(
    paymentId: string,
    nextScope: SplitScope,
    data: UpdatePaymentInput,
  ): Promise<void> {
    if (nextScope !== "custom") {
      // Switching (or staying) on a scope leaves no rows behind: a list that
      // was stored under `custom` must not survive beside the rule.
      if (data.splitScope !== undefined) {
        await this.db
          .delete(paymentParticipants)
          .where(eq(paymentParticipants.paymentId, paymentId));
      }
      return;
    }

    if (data.participants !== undefined) {
      await this.db
        .delete(paymentParticipants)
        .where(eq(paymentParticipants.paymentId, paymentId));

      await this.db.insert(paymentParticipants).values(
        data.participants.map((p) => ({ paymentId, memberId: p.memberId })),
      );
    }
  }

  /**
   * Delete an expense or a settlement, for good.
   *
   * A real `DELETE`, not a `deleted_at` mark: `payments.member_id` is a
   * RESTRICT foreign key to `members`, so a soft-deleted row kept blocking the
   * removal of the person who paid it while every read filtered it out of the
   * ledger — an invisible refusal with no screen able to explain it.
   * `payment_participants` rides on `ON DELETE CASCADE`, so the rows go with
   * the payment. There is no restore, which is why the form asks first.
   */
  async deletePayment(userId: string, paymentId: string): Promise<void> {
    const [existing] = await this.db
      .select({
        id: payments.id,
        tripId: payments.tripId,
        createdBy: payments.createdBy,
      })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!existing) {
      throw new PaymentNotFoundError();
    }

    const canModify = await this.canModifyPayment(userId, existing);
    if (!canModify) {
      throw new PermissionDeniedError(
        "Permission denied: only payment creator or organizers can delete payments",
      );
    }

    await this.db.delete(payments).where(eq(payments.id, paymentId));
  }

  /**
   * Validate that every memberId belongs to the trip.
   * Guests (userId NULL rows) are valid members — including as payer.
   * Throws PaymentMemberNotInTripError (409) on the first mismatch.
   */
  private async assertMembersInTrip(
    tripId: string,
    memberIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(memberIds)];
    if (uniqueIds.length === 0) return;

    const rows = await this.db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.tripId, tripId), inArray(members.id, uniqueIds)));

    if (rows.length !== uniqueIds.length) {
      const found = new Set(rows.map((r) => r.id));
      const missing = uniqueIds.find((id) => !found.has(id));
      throw new PaymentMemberNotInTripError(
        `Member ${missing} is not a member of this trip`,
      );
    }
  }

  private async canModifyPayment(
    userId: string,
    payment: { tripId: string; createdBy: string },
  ): Promise<boolean> {
    if (payment.createdBy === userId) return true;
    return this.permissionsService.isOrganizer(userId, payment.tripId);
  }

  /**
   * A trip's payments are readable by its members and nobody else. Fails
   * closed: a caller with no member row on the trip gets 403.
   */
  private async assertMember(userId: string, tripId: string): Promise<void> {
    const isMember = await this.permissionsService.isMember(userId, tripId);
    if (!isMember) {
      throw new PermissionDeniedError(
        "Permission denied: only trip members can read a trip's payments",
      );
    }
  }

  /**
   * The payer's name and the split, read back from the same resolver every
   * read uses.
   *
   * Not "add a name to what I just wrote": a share is a fact about the trip's
   * history, so a write's response is a *read* of the spread the write landed
   * in. A response assembled from the write's own inputs could differ from the
   * next `GET` by a cent, which is exactly the kind of disagreement that makes
   * a ledger look wrong.
   */
  private async enrichPayment(
    tripId: string,
    payment: Payment,
  ): Promise<PaymentWithParticipants> {
    const { roster, participants } = await loadTripSplits(this.db, tripId);
    const nameById = new Map(roster.map((member) => [member.id, member.name]));

    return {
      ...payment,
      payerMemberId: payment.memberId,
      payerName: nameById.get(payment.memberId) ?? "Unknown",
      participants: participants.get(payment.id) ?? [],
    };
  }

  /**
   * Reject duplicate participant memberIds (400): duplicates would double-
   * count one member's share and silently short-change the others.
   */
  private assertNoDuplicateParticipants(memberIds: string[]): void {
    if (new Set(memberIds).size !== memberIds.length) {
      throw new DuplicateParticipantError(
        "Duplicate participant: each member may appear only once per payment",
      );
    }
  }
}
