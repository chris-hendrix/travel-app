import {
  payments,
  paymentParticipants,
  members,
  users,
  type Payment,
} from "@/db/schema/index.js";
import { eq, and, isNull, inArray } from "drizzle-orm";
import type {
  CreatePaymentInput,
  UpdatePaymentInput,
} from "@journiful/shared/schemas";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import {
  PaymentNotFoundError,
  PermissionDeniedError,
  MemberNotFoundError,
} from "../errors.js";

interface PaymentParticipantWithInfo {
  id: string;
  paymentId: string;
  memberId: string;
  shareAmount: number;
  name?: string;
  isPlaceholder?: boolean;
  createdAt: Date;
}

interface PaymentWithParticipants extends Payment {
  payerName?: string;
  payerIsPlaceholder?: boolean;
  participants: PaymentParticipantWithInfo[];
}

/** Resolved member display info: name + placeholder flag */
interface MemberInfo {
  name: string;
  isPlaceholder: boolean;
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

    // Validate that the payer and all participants belong to this trip
    await this.validateMembersBelongToTrip(tripId, [
      data.memberId,
      ...data.participants.map((p) => p.memberId),
    ]);

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
        memberId: data.memberId,
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

    // Collect all member IDs for name/placeholder lookup
    const memberIds = new Set<string>();
    for (const p of paymentRows) {
      memberIds.add(p.memberId);
    }
    for (const pp of participantRows) {
      memberIds.add(pp.memberId);
    }

    const memberMap = await this.buildMemberMap(Array.from(memberIds));

    // Group participants by payment
    const participantsByPayment = new Map<string, typeof participantRows>();
    for (const pp of participantRows) {
      const list = participantsByPayment.get(pp.paymentId) ?? [];
      list.push(pp);
      participantsByPayment.set(pp.paymentId, list);
    }

    return paymentRows.map((p) => {
      const pParticipants = participantsByPayment.get(p.id) ?? [];
      const payer = memberMap.get(p.memberId);
      return {
        ...p,
        payerName: payer?.name ?? "Unknown",
        payerIsPlaceholder: payer?.isPlaceholder ?? false,
        participants: pParticipants.map((pp) => {
          const info = memberMap.get(pp.memberId);
          return {
            ...pp,
            name: info?.name ?? "Unknown",
            isPlaceholder: info?.isPlaceholder ?? false,
          };
        }),
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

    // Validate any new member references belong to this trip
    const newMemberIds: string[] = [];
    if (data.memberId !== undefined) newMemberIds.push(data.memberId);
    if (data.participants !== undefined) {
      for (const p of data.participants) newMemberIds.push(p.memberId);
    }
    if (newMemberIds.length > 0) {
      await this.validateMembersBelongToTrip(existing.tripId, newMemberIds);
    }

    // Build update data
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.memberId !== undefined) updateData.memberId = data.memberId;
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

  private async canModifyPayment(
    userId: string,
    payment: { tripId: string; createdBy: string },
  ): Promise<boolean> {
    if (payment.createdBy === userId) return true;
    return this.permissionsService.isOrganizer(userId, payment.tripId);
  }

  /**
   * Ensure every referenced member belongs to the given trip.
   * Throws MemberNotFoundError if any member is missing or foreign.
   */
  private async validateMembersBelongToTrip(
    tripId: string,
    memberIds: string[],
  ): Promise<void> {
    const unique = Array.from(new Set(memberIds));
    if (unique.length === 0) return;

    const rows = await this.db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.tripId, tripId), inArray(members.id, unique)));

    if (rows.length !== unique.length) {
      throw new MemberNotFoundError();
    }
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

    const memberMap = await this.buildMemberMap(Array.from(memberIds));
    const payer = memberMap.get(payment.memberId);

    return {
      ...payment,
      payerName: payer?.name ?? "Unknown",
      payerIsPlaceholder: payer?.isPlaceholder ?? false,
      participants: participantRows.map((pp) => {
        const info = memberMap.get(pp.memberId);
        return {
          ...pp,
          name: info?.name ?? "Unknown",
          isPlaceholder: info?.isPlaceholder ?? false,
        };
      }),
    };
  }

  /**
   * Resolve member display info in a single members query joined to users.
   * name = COALESCE(users.displayName, members.displayName)
   * isPlaceholder = members.userId IS NULL
   */
  private async buildMemberMap(
    memberIds: string[],
  ): Promise<Map<string, MemberInfo>> {
    const map = new Map<string, MemberInfo>();
    if (memberIds.length === 0) return map;

    const rows = await this.db
      .select({
        id: members.id,
        userId: members.userId,
        memberDisplayName: members.displayName,
        userDisplayName: users.displayName,
      })
      .from(members)
      .leftJoin(users, eq(members.userId, users.id))
      .where(inArray(members.id, memberIds));

    for (const r of rows) {
      map.set(r.id, {
        name: r.userDisplayName ?? r.memberDisplayName ?? "Unknown",
        isPlaceholder: r.userId === null,
      });
    }

    return map;
  }
}
