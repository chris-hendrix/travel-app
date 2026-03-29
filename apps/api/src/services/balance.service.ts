import {
  payments,
  paymentParticipants,
  users,
  tripGuests,
} from "@/db/schema/index.js";
import { eq, and, isNull, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/types/index.js";

interface BalancePerson {
  id: string;
  name: string;
  isGuest: boolean;
}

interface BalanceEntry {
  from: BalancePerson;
  to: BalancePerson;
  amount: number;
}

interface MyBalanceDetail {
  person: BalancePerson;
  amount: number;
}

export interface IBalanceService {
  getTripBalances(tripId: string): Promise<BalanceEntry[]>;
  getMyBalance(
    tripId: string,
    userId: string,
  ): Promise<{ netBalance: number; details: MyBalanceDetail[] }>;
}

export class BalanceService implements IBalanceService {
  constructor(private db: AppDatabase) {}

  async getTripBalances(tripId: string): Promise<BalanceEntry[]> {
    const netBalances = await this.computeNetBalances(tripId);
    const personMap = await this.buildPersonMap(tripId);
    return this.simplifyDebts(netBalances, personMap);
  }

  async getMyBalance(
    tripId: string,
    userId: string,
  ): Promise<{ netBalance: number; details: MyBalanceDetail[] }> {
    const balances = await this.getTripBalances(tripId);
    const userKey = `user:${userId}`;

    let netBalance = 0;
    const details: MyBalanceDetail[] = [];

    for (const entry of balances) {
      const fromKey = entry.from.isGuest
        ? `guest:${entry.from.id}`
        : `user:${entry.from.id}`;
      const toKey = entry.to.isGuest
        ? `guest:${entry.to.id}`
        : `user:${entry.to.id}`;

      if (fromKey === userKey) {
        // User owes this person
        netBalance -= entry.amount;
        details.push({ person: entry.to, amount: entry.amount });
      } else if (toKey === userKey) {
        // This person owes user
        netBalance += entry.amount;
        details.push({ person: entry.from, amount: -entry.amount });
      }
    }

    return { netBalance, details };
  }

  /**
   * Compute net balance per person across all non-deleted payments.
   * Positive = owed money (net payer). Negative = owes money (net debtor).
   * Key format: "user:<id>" or "guest:<id>"
   */
  private async computeNetBalances(
    tripId: string,
  ): Promise<Map<string, number>> {
    const net = new Map<string, number>();

    // Get all non-deleted payments for this trip
    const paymentRows = await this.db
      .select({
        id: payments.id,
        amount: payments.amount,
        userId: payments.userId,
        guestId: payments.guestId,
      })
      .from(payments)
      .where(and(eq(payments.tripId, tripId), isNull(payments.deletedAt)));

    if (paymentRows.length === 0) return net;

    const paymentIds = paymentRows.map((p) => p.id);

    // Get all participants
    const participantRows = await this.db
      .select({
        paymentId: paymentParticipants.paymentId,
        userId: paymentParticipants.userId,
        guestId: paymentParticipants.guestId,
        shareAmount: paymentParticipants.shareAmount,
      })
      .from(paymentParticipants)
      .where(inArray(paymentParticipants.paymentId, paymentIds));

    // Group participants by payment
    const participantsByPayment = new Map<string, typeof participantRows>();
    for (const pp of participantRows) {
      const list = participantsByPayment.get(pp.paymentId) ?? [];
      list.push(pp);
      participantsByPayment.set(pp.paymentId, list);
    }

    for (const payment of paymentRows) {
      const payerKey = payment.userId
        ? `user:${payment.userId}`
        : `guest:${payment.guestId}`;

      // Payer gains credit for the full amount
      net.set(payerKey, (net.get(payerKey) ?? 0) + payment.amount);

      // Each participant owes their share
      const pParticipants = participantsByPayment.get(payment.id) ?? [];
      for (const pp of pParticipants) {
        const participantKey = pp.userId
          ? `user:${pp.userId}`
          : `guest:${pp.guestId}`;
        net.set(
          participantKey,
          (net.get(participantKey) ?? 0) - pp.shareAmount,
        );
      }
    }

    return net;
  }

  /**
   * Greedy debt simplification algorithm.
   * Match the person with the largest positive balance (creditor)
   * with the person with the largest negative balance (debtor),
   * transfer min(abs(positive), abs(negative)), repeat until all zeroed out.
   */
  private simplifyDebts(
    netBalances: Map<string, number>,
    personMap: Map<string, BalancePerson>,
  ): BalanceEntry[] {
    // Filter out zero balances and split into creditors/debtors
    const creditors: { key: string; amount: number }[] = [];
    const debtors: { key: string; amount: number }[] = [];

    for (const [key, amount] of netBalances) {
      if (amount > 0) {
        creditors.push({ key, amount });
      } else if (amount < 0) {
        debtors.push({ key, amount: -amount }); // store as positive
      }
    }

    // Sort descending by amount
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const result: BalanceEntry[] = [];
    let ci = 0;
    let di = 0;

    while (ci < creditors.length && di < debtors.length) {
      const creditor = creditors[ci]!;
      const debtor = debtors[di]!;
      const transfer = Math.min(creditor.amount, debtor.amount);

      if (transfer > 0) {
        const fromPerson = personMap.get(debtor.key);
        const toPerson = personMap.get(creditor.key);

        if (fromPerson && toPerson) {
          result.push({
            from: fromPerson,
            to: toPerson,
            amount: transfer,
          });
        }
      }

      creditor.amount -= transfer;
      debtor.amount -= transfer;

      if (creditor.amount === 0) ci++;
      if (debtor.amount === 0) di++;
    }

    return result;
  }

  /**
   * Build a lookup map of person keys to person info for all
   * users and guests involved in a trip's payments.
   */
  private async buildPersonMap(
    tripId: string,
  ): Promise<Map<string, BalancePerson>> {
    const personMap = new Map<string, BalancePerson>();

    // Get all non-deleted payments for user/guest IDs
    const paymentRows = await this.db
      .select({
        userId: payments.userId,
        guestId: payments.guestId,
      })
      .from(payments)
      .where(and(eq(payments.tripId, tripId), isNull(payments.deletedAt)));

    const paymentIds = (
      await this.db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.tripId, tripId), isNull(payments.deletedAt)))
    ).map((p) => p.id);

    const userIds = new Set<string>();
    const guestIds = new Set<string>();

    for (const p of paymentRows) {
      if (p.userId) userIds.add(p.userId);
      if (p.guestId) guestIds.add(p.guestId);
    }

    if (paymentIds.length > 0) {
      const participantRows = await this.db
        .select({
          userId: paymentParticipants.userId,
          guestId: paymentParticipants.guestId,
        })
        .from(paymentParticipants)
        .where(inArray(paymentParticipants.paymentId, paymentIds));

      for (const pp of participantRows) {
        if (pp.userId) userIds.add(pp.userId);
        if (pp.guestId) guestIds.add(pp.guestId);
      }
    }

    if (userIds.size > 0) {
      const userRows = await this.db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, Array.from(userIds)));

      for (const u of userRows) {
        personMap.set(`user:${u.id}`, {
          id: u.id,
          name: u.displayName,
          isGuest: false,
        });
      }
    }

    if (guestIds.size > 0) {
      const guestRows = await this.db
        .select({ id: tripGuests.id, name: tripGuests.name })
        .from(tripGuests)
        .where(inArray(tripGuests.id, Array.from(guestIds)));

      for (const g of guestRows) {
        personMap.set(`guest:${g.id}`, {
          id: g.id,
          name: g.name,
          isGuest: true,
        });
      }
    }

    return personMap;
  }
}
