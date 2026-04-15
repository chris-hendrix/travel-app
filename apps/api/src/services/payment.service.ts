import {
  payments,
  paymentParticipants,
  users,
  tripGuests,
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
} from "../errors.js";

interface PaymentWithParticipants extends Payment {
  payerName?: string;
  payerIsGuest?: boolean;
  participants: {
    id: string;
    paymentId: string;
    userId: string | null;
    guestId: string | null;
    shareAmount: number;
    name?: string;
    isGuest?: boolean;
    createdAt: Date;
  }[];
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
        userId: data.userId ?? null,
        guestId: data.guestId ?? null,
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
          userId: p.userId ?? null,
          guestId: p.guestId ?? null,
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

    // Collect all user IDs and guest IDs for name lookup
    const userIds = new Set<string>();
    const guestIds = new Set<string>();

    for (const p of paymentRows) {
      if (p.userId) userIds.add(p.userId);
      if (p.guestId) guestIds.add(p.guestId);
    }
    for (const pp of participantRows) {
      if (pp.userId) userIds.add(pp.userId);
      if (pp.guestId) guestIds.add(pp.guestId);
    }

    const nameMap = await this.buildNameMap(
      Array.from(userIds),
      Array.from(guestIds),
    );

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
        payerName: p.userId
          ? (nameMap.get(`user:${p.userId}`) ?? "Unknown")
          : (nameMap.get(`guest:${p.guestId}`) ?? "Unknown"),
        payerIsGuest: p.guestId != null,
        participants: pParticipants.map((pp) => ({
          ...pp,
          name: pp.userId
            ? (nameMap.get(`user:${pp.userId}`) ?? "Unknown")
            : (nameMap.get(`guest:${pp.guestId}`) ?? "Unknown"),
          isGuest: pp.guestId != null,
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

    // Build update data
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.description !== undefined) updateData.description = data.description;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.userId !== undefined) updateData.userId = data.userId ?? null;
    if (data.guestId !== undefined) updateData.guestId = data.guestId ?? null;
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
            userId: p.userId ?? null,
            guestId: p.guestId ?? null,
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

  private async enrichPayment(
    payment: Payment,
    participantRows: {
      id: string;
      paymentId: string;
      userId: string | null;
      guestId: string | null;
      shareAmount: number;
      createdAt: Date;
    }[],
  ): Promise<PaymentWithParticipants> {
    const userIds = new Set<string>();
    const guestIds = new Set<string>();

    if (payment.userId) userIds.add(payment.userId);
    if (payment.guestId) guestIds.add(payment.guestId);
    for (const pp of participantRows) {
      if (pp.userId) userIds.add(pp.userId);
      if (pp.guestId) guestIds.add(pp.guestId);
    }

    const nameMap = await this.buildNameMap(
      Array.from(userIds),
      Array.from(guestIds),
    );

    return {
      ...payment,
      payerName: payment.userId
        ? (nameMap.get(`user:${payment.userId}`) ?? "Unknown")
        : (nameMap.get(`guest:${payment.guestId}`) ?? "Unknown"),
      payerIsGuest: payment.guestId != null,
      participants: participantRows.map((pp) => ({
        ...pp,
        name: pp.userId
          ? (nameMap.get(`user:${pp.userId}`) ?? "Unknown")
          : (nameMap.get(`guest:${pp.guestId}`) ?? "Unknown"),
        isGuest: pp.guestId != null,
      })),
    };
  }

  private async buildNameMap(
    userIds: string[],
    guestIds: string[],
  ): Promise<Map<string, string>> {
    const nameMap = new Map<string, string>();

    if (userIds.length > 0) {
      const userRows = await this.db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, userIds));
      for (const u of userRows) {
        nameMap.set(`user:${u.id}`, u.displayName);
      }
    }

    if (guestIds.length > 0) {
      const guestRows = await this.db
        .select({ id: tripGuests.id, name: tripGuests.name })
        .from(tripGuests)
        .where(inArray(tripGuests.id, guestIds));
      for (const g of guestRows) {
        nameMap.set(`guest:${g.id}`, g.name);
      }
    }

    return nameMap;
  }
}
