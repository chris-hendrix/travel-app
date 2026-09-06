import {
  payments,
  paymentParticipants,
  members,
  users,
  type Payment,
} from "@/db/schema/index.js";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import type {
  CreatePaymentInput,
  UpdatePaymentInput,
} from "@journiful/shared/schemas";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import {
  PaymentNotFoundError,
  PaymentMemberNotInTripError,
  PermissionDeniedError,
} from "../errors.js";

interface PaymentParticipantView {
  id: string;
  paymentId: string;
  memberId: string;
  shareAmount: number;
  name?: string;
  createdAt: Date;
}

interface PaymentWithParticipants extends Omit<Payment, "memberId"> {
  memberId: string;
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

    // Validate payer + all participants belong to this trip.
    // Guests are allowed as payer — the organizer records who paid;
    // `createdBy` stays the recording user.
    const participantMemberIds = data.participants.map((p) => p.memberId);
    await this.assertMembersInTrip(
      tripId,
      [data.payerMemberId, ...participantMemberIds],
    );

    // Compute equal shares with cent rounding
    const shares = this.computeEqualShares(
      data.amount,
      data.participants.length,
    );

    // Create payment and participants in a transaction
    const [payment] = await this.db
      .insert(payments)
      .values({
        tripId,
        description: data.description,
        amount: data.amount,
        memberId: data.payerMemberId,
        date: data.date ? new Date(data.date) : new Date(),
        createdBy: userId,
      })
      .returning();

    if (!payment) {
      throw new Error("Failed to create payment");
    }

    const participantRows = await this.db
      .insert(paymentParticipants)
      .values(
        data.participants.map((p, i) => ({
          paymentId: payment.id,
          memberId: p.memberId,
          shareAmount: shares[i]!,
        })),
      )
      .returning();

    return this.enrichPayment(payment, participantRows);
  }

  async getPaymentsByTrip(
    tripId: string,
    includeDeleted = false,
  ): Promise<PaymentWithParticipants[]> {
    const conditions = [eq(payments.tripId, tripId)];
    if (!includeDeleted) {
      conditions.push(isNull(payments.deletedAt));
    }

    const paymentRows = await this.db
      .select()
      .from(payments)
      .where(and(...conditions));

    if (paymentRows.length === 0) return [];

    const paymentIds = paymentRows.map((p) => p.id);

    // Fetch all participants for these payments
    const participantRows = await this.db
      .select()
      .from(paymentParticipants)
      .where(inArray(paymentParticipants.paymentId, paymentIds));

    // Collect all member IDs for name lookup
    const memberIds = new Set<string>();

    for (const p of paymentRows) {
      memberIds.add(p.memberId);
    }
    for (const pp of participantRows) {
      memberIds.add(pp.memberId);
    }

    const nameMap = await this.buildMemberNameMap(Array.from(memberIds));

    // Group participants by payment
    const participantsByPayment = new Map<string, typeof participantRows>();
    for (const pp of participantRows) {
      const list = participantsByPayment.get(pp.paymentId) ?? [];
      list.push(pp);
      participantsByPayment.set(pp.paymentId, list);
    }

    return paymentRows.map((p) => {
      const pParticipants = participantsByPayment.get(p.id) ?? [];
      return {
        ...p,
        payerMemberId: p.memberId,
        payerName: nameMap.get(p.memberId) ?? "Unknown",
        participants: pParticipants.map((pp) => ({
          ...pp,
          name: nameMap.get(pp.memberId) ?? "Unknown",
        })),
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
      await this.assertMembersInTrip(
        existing.tripId,
        data.participants.map((p) => p.memberId),
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.description !== undefined) updateData.description = data.description;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.payerMemberId !== undefined)
      updateData.memberId = data.payerMemberId;
    if (data.date !== undefined) updateData.date = new Date(data.date);

    const [updated] = await this.db
      .update(payments)
      .set(updateData)
      .where(eq(payments.id, paymentId))
      .returning();

    if (!updated) {
      throw new PaymentNotFoundError();
    }

    // If participants or amount changed, recompute shares
    let participantRows;
    if (data.participants !== undefined) {
      // Delete existing participants and insert new ones
      await this.db
        .delete(paymentParticipants)
        .where(eq(paymentParticipants.paymentId, paymentId));

      const finalAmount = data.amount ?? existing.amount;
      const shares = this.computeEqualShares(
        finalAmount,
        data.participants.length,
      );

      participantRows = await this.db
        .insert(paymentParticipants)
        .values(
          data.participants.map((p, i) => ({
            paymentId,
            memberId: p.memberId,
            shareAmount: shares[i]!,
          })),
        )
        .returning();
    } else if (data.amount !== undefined) {
      // Amount changed but participants didn't — recompute shares for existing participants
      const existingParticipants = await this.db
        .select()
        .from(paymentParticipants)
        .where(eq(paymentParticipants.paymentId, paymentId));

      const shares = this.computeEqualShares(
        data.amount,
        existingParticipants.length,
      );

      // Update each participant's share
      participantRows = [];
      for (let i = 0; i < existingParticipants.length; i++) {
        const [updatedPp] = await this.db
          .update(paymentParticipants)
          .set({ shareAmount: shares[i]! })
          .where(eq(paymentParticipants.id, existingParticipants[i]!.id))
          .returning();
        if (updatedPp) participantRows.push(updatedPp);
      }
    } else {
      participantRows = await this.db
        .select()
        .from(paymentParticipants)
        .where(eq(paymentParticipants.paymentId, paymentId));
    }

    return this.enrichPayment(updated, participantRows);
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

    const participantRows = await this.db
      .select()
      .from(paymentParticipants)
      .where(eq(paymentParticipants.paymentId, paymentId));

    return this.enrichPayment(restored, participantRows);
  }

  /**
   * Compute equal shares with cent rounding.
   * Remainder cents go to the first participant.
   */
  private computeEqualShares(amount: number, count: number): number[] {
    const base = Math.floor(amount / count);
    const remainder = amount - base * count;
    return Array.from({ length: count }, (_, i) =>
      i < remainder ? base + 1 : base,
    );
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

  private async enrichPayment(
    payment: Payment,
    participantRows: {
      id: string;
      paymentId: string;
      memberId: string;
      shareAmount: number;
      createdAt: Date;
    }[],
  ): Promise<PaymentWithParticipants> {
    const memberIds = new Set<string>();

    memberIds.add(payment.memberId);
    for (const pp of participantRows) {
      memberIds.add(pp.memberId);
    }

    const nameMap = await this.buildMemberNameMap(Array.from(memberIds));

    return {
      ...payment,
      payerMemberId: payment.memberId,
      payerName: nameMap.get(payment.memberId) ?? "Unknown",
      participants: participantRows.map((pp) => ({
        ...pp,
        name: nameMap.get(pp.memberId) ?? "Unknown",
      })),
    };
  }

  private async buildMemberNameMap(
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
        .where(inArray(members.id, memberIds));
      for (const r of rows) {
        nameMap.set(r.id, r.name);
      }
    }

    return nameMap;
  }
}
