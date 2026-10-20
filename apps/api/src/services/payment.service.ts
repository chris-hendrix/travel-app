import {
  payments,
  paymentParticipants,
  members,
  users,
  type Payment,
} from "@/db/schema/index.js";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { equalShares, type SplitScope } from "@journiful/shared/utils";
import type {
  CreatePaymentInput,
  UpdatePaymentInput,
} from "@journiful/shared/schemas";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import {
  asSplitScope,
  loadSplitMembers,
  resolveScopedSplit,
  splitForScope,
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
    includeDeleted?: boolean,
  ): Promise<PaymentWithParticipants[]>;

  updatePayment(
    userId: string,
    paymentId: string,
    data: UpdatePaymentInput,
  ): Promise<PaymentWithParticipants>;

  deletePayment(userId: string, paymentId: string): Promise<void>;

  restorePayment(
    userId: string,
    paymentId: string,
  ): Promise<PaymentWithParticipants>;
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

    // The payer is checked on every path. A scoped split needs no membership
    // check of its participants — they come from the trip's own roster, so
    // they are members by construction — but a scope says nothing about who
    // paid.
    await this.assertMembersInTrip(tripId, [data.payerMemberId]);

    if (scope !== "custom") {
      return this.createScopedPayment(userId, tripId, data, scope);
    }

    const participants = data.participants ?? [];

    // Validate the participants belong to this trip too.
    // Guests are allowed — the organizer records who paid; `createdBy` stays
    // the recording user.
    const participantMemberIds = participants.map((p) => p.memberId);
    this.assertNoDuplicateParticipants(participantMemberIds);
    await this.assertMembersInTrip(tripId, participantMemberIds);

    // Compute equal shares with cent rounding
    const shares = this.computeEqualShares(data.amount, participants.length);

    // Payment + participants insert atomically: a participants-insert
    // failure must not leave an orphan payment row.
    const { payment, participantRows } = await this.db.transaction(
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

        const participantRows = await tx
          .insert(paymentParticipants)
          .values(
            participants.map((p, i) => ({
              paymentId: payment.id,
              memberId: p.memberId,
              shareAmount: shares[i]!,
            })),
          )
          .returning();
        return { payment, participantRows };
      },
    );

    return this.enrichPayment(tripId, payment, participantRows);
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
    const participants = splitForScope(scope, roster, data.amount);

    if (participants.length === 0) {
      throw new EmptySplitError(
        scope === "all_going"
          ? "Nobody is going yet — choose who this cost was shared between"
          : "Nobody is on this trip yet — choose who this cost was shared between",
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

    return this.enrichPayment(tripId, payment, participants);
  }

  async getPaymentsByTrip(
    userId: string,
    tripId: string,
    includeDeleted = false,
  ): Promise<PaymentWithParticipants[]> {
    await this.assertMember(userId, tripId);

    const conditions = [eq(payments.tripId, tripId)];
    if (!includeDeleted) {
      conditions.push(isNull(payments.deletedAt));
    }

    const paymentRows = await this.db
      .select()
      .from(payments)
      .where(and(...conditions));

    if (paymentRows.length === 0) return [];

    // One roster read serves both the names and every scoped payment in this
    // list: a scope is re-resolved per read, so this *is* the read. A member
    // added since the payment was filed is in it, and one removed is not.
    const roster = await loadSplitMembers(this.db, tripId);
    const nameById = new Map(roster.map((member) => [member.id, member.name]));

    // Only a `custom` payment has rows. Filtering the read by scope keeps a
    // stray row on a scoped payment from widening its split: the scope is the
    // record there, and the rows would be the artifact of a half-done switch.
    const customPaymentIds = paymentRows
      .filter((p) => asSplitScope(p.splitScope) === "custom")
      .map((p) => p.id);

    const participantRows =
      customPaymentIds.length > 0
        ? await this.db
            .select()
            .from(paymentParticipants)
            .where(inArray(paymentParticipants.paymentId, customPaymentIds))
        : [];

    // Group participants by payment
    const participantsByPayment = new Map<string, typeof participantRows>();
    for (const pp of participantRows) {
      const list = participantsByPayment.get(pp.paymentId) ?? [];
      list.push(pp);
      participantsByPayment.set(pp.paymentId, list);
    }

    return paymentRows.map((p) => {
      const scope = asSplitScope(p.splitScope);
      return {
        ...p,
        splitScope: scope,
        payerMemberId: p.memberId,
        payerName: nameById.get(p.memberId) ?? "Unknown",
        participants:
          scope === "custom"
            ? (participantsByPayment.get(p.id) ?? []).map((pp) => ({
                ...pp,
                name: nameById.get(pp.memberId) ?? "Unknown",
              }))
            : resolveScopedSplit(scope, roster, p.amount, p.memberId),
      };
    });
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
      .where(and(eq(payments.id, paymentId), isNull(payments.deletedAt)))
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

    const participants = await this.writeSplitForUpdate(
      paymentId,
      existing.tripId,
      updated,
      nextScope,
      data,
    );

    return this.enrichPayment(existing.tripId, updated, participants);
  }

  /**
   * Bring `payment_participants` in line with the split the update asked for,
   * and return the participants the response should carry.
   *
   * The invariant is one line — `custom` has rows, a scope has none — and the
   * splits are re-derived rather than copied, so an amount change and a
   * participant change go through the same arithmetic.
   */
  private async writeSplitForUpdate(
    paymentId: string,
    tripId: string,
    updated: Payment,
    nextScope: SplitScope,
    data: UpdatePaymentInput,
  ): Promise<PaymentParticipantView[]> {
    if (nextScope !== "custom") {
      // Switching (or staying) on a scope leaves no rows behind: a list that
      // was stored under `custom` must not survive beside the rule.
      if (data.splitScope !== undefined) {
        await this.db
          .delete(paymentParticipants)
          .where(eq(paymentParticipants.paymentId, paymentId));
      }

      const roster = await loadSplitMembers(this.db, tripId);
      return resolveScopedSplit(
        nextScope,
        roster,
        updated.amount,
        updated.memberId,
      );
    }

    if (data.participants !== undefined) {
      // Delete existing participants and insert new ones
      await this.db
        .delete(paymentParticipants)
        .where(eq(paymentParticipants.paymentId, paymentId));

      const shares = this.computeEqualShares(
        updated.amount,
        data.participants.length,
      );

      return this.db
        .insert(paymentParticipants)
        .values(
          data.participants.map((p, i) => ({
            paymentId,
            memberId: p.memberId,
            shareAmount: shares[i]!,
          })),
        )
        .returning();
    }

    if (data.amount !== undefined) {
      // Amount changed but participants didn't — recompute shares for existing participants
      const existingParticipants = await this.db
        .select()
        .from(paymentParticipants)
        .where(eq(paymentParticipants.paymentId, paymentId));

      const shares = this.computeEqualShares(
        updated.amount,
        existingParticipants.length,
      );

      // Update each participant's share
      const participantRows: PaymentParticipantView[] = [];
      for (let i = 0; i < existingParticipants.length; i++) {
        const [updatedPp] = await this.db
          .update(paymentParticipants)
          .set({ shareAmount: shares[i]! })
          .where(eq(paymentParticipants.id, existingParticipants[i]!.id))
          .returning();
        if (updatedPp) participantRows.push(updatedPp);
      }
      return participantRows;
    }

    return this.db
      .select()
      .from(paymentParticipants)
      .where(eq(paymentParticipants.paymentId, paymentId));
  }

  async deletePayment(userId: string, paymentId: string): Promise<void> {
    const [existing] = await this.db
      .select({
        id: payments.id,
        tripId: payments.tripId,
        createdBy: payments.createdBy,
      })
      .from(payments)
      .where(and(eq(payments.id, paymentId), isNull(payments.deletedAt)))
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

    await this.db
      .update(payments)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId));
  }

  async restorePayment(
    userId: string,
    paymentId: string,
  ): Promise<PaymentWithParticipants> {
    const [existing] = await this.db
      .select({ id: payments.id, tripId: payments.tripId })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!existing) {
      throw new PaymentNotFoundError();
    }

    const isOrganizer = await this.permissionsService.isOrganizer(
      userId,
      existing.tripId,
    );
    if (!isOrganizer) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can restore payments",
      );
    }

    const [restored] = await this.db
      .update(payments)
      .set({
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId))
      .returning();

    if (!restored) {
      throw new PaymentNotFoundError();
    }

    const scope = asSplitScope(restored.splitScope);
    const participantRows =
      scope === "custom"
        ? await this.db
            .select()
            .from(paymentParticipants)
            .where(eq(paymentParticipants.paymentId, paymentId))
        : resolveScopedSplit(
            scope,
            await loadSplitMembers(this.db, existing.tripId),
            restored.amount,
            restored.memberId,
          );

    return this.enrichPayment(existing.tripId, restored, participantRows);
  }

  /**
   * Equal shares with cent rounding, in the order given.
   *
   * Delegates to `shared/utils/split.ts`'s `equalShares`: the form previews the
   * same numbers and the demo serves them, so the arithmetic has one home and
   * three callers cannot drift apart by a cent.
   */
  private computeEqualShares(amount: number, count: number): number[] {
    return equalShares(amount, count);
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
   * Add the payer's name and the display names of any participant that does
   * not already carry one.
   *
   * A participant resolved from a scope arrives named (the roster read that
   * produced it had the names in hand); a stored `custom` row does not. So the
   * lookup below is one query either way for the payer, and nothing extra for
   * a scoped split.
   */
  private async enrichPayment(
    tripId: string,
    payment: Payment,
    participants: PaymentParticipantView[],
  ): Promise<PaymentWithParticipants> {
    const unnamed = participants
      .filter((p) => p.name === undefined)
      .map((p) => p.memberId);

    const nameMap = await this.buildMemberNameMap(tripId, [
      payment.memberId,
      ...unnamed,
    ]);

    return {
      ...payment,
      payerMemberId: payment.memberId,
      payerName: nameMap.get(payment.memberId) ?? "Unknown",
      participants: participants.map((p) => ({
        ...p,
        name: p.name ?? nameMap.get(p.memberId) ?? "Unknown",
      })),
    };
  }

  private async buildMemberNameMap(
    tripId: string,
    memberIds: string[],
  ): Promise<Map<string, string>> {
    const nameMap = new Map<string, string>();

    if (memberIds.length > 0) {
      const rows = await this.db
        .select({
          id: members.id,
          name: sql<string>`coalesce(${users.displayName}, ${members.guestDisplayName}, 'Unknown')`,
        })
        .from(members)
        .leftJoin(users, eq(members.userId, users.id))
        .where(
          and(eq(members.tripId, tripId), inArray(members.id, memberIds)),
        );
      for (const r of rows) {
        nameMap.set(r.id, r.name);
      }
    }

    return nameMap;
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
