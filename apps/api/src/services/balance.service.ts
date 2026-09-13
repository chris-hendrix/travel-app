import {
  payments,
  paymentParticipants,
  members,
  users,
} from "@/db/schema/index.js";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import type { AppDatabase } from "@/types/index.js";

interface BalancePerson {
  id: string;
  name: string;
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
    // Resolve the caller via their member row first — guests (userId NULL
    // rows) are never callers, and the caller key is member:<members.id>.
    const [caller] = await this.db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId)))
      .limit(1);

    if (!caller) {
      return { netBalance: 0, details: [] };
    }

    const balances = await this.getTripBalances(tripId);
    const myId = caller.id;

    let netBalance = 0;
    const details: MyBalanceDetail[] = [];

    for (const entry of balances) {
      if (entry.from.id === myId) {
        // User owes this person (incl. guests)
        netBalance -= entry.amount;
        details.push({ person: entry.to, amount: entry.amount });
      } else if (entry.to.id === myId) {
        // This person (incl. guests) owes user
        netBalance += entry.amount;
        details.push({ person: entry.from, amount: -entry.amount });
      }
    }

    return { netBalance, details };
  }

  /**
   * Compute net balance per member across all non-deleted payments.
   * Positive = owed money (net payer). Negative = owes money (net debtor).
   * Key format: "member:<members.id>". The payer key comes straight from
   * payments.memberId — no join-through-user needed.
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
        memberId: payments.memberId,
      })
      .from(payments)
      .where(and(eq(payments.tripId, tripId), isNull(payments.deletedAt)));

    if (paymentRows.length === 0) return net;

    const paymentIds = paymentRows.map((p) => p.id);

    // Get all participants
    const participantRows = await this.db
      .select({
        paymentId: paymentParticipants.paymentId,
        memberId: paymentParticipants.memberId,
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
      const payerKey = `member:${payment.memberId}`;

      // Payer gains credit for the full amount
      net.set(payerKey, (net.get(payerKey) ?? 0) + payment.amount);

      // Each participant owes their share
      const pParticipants = participantsByPayment.get(payment.id) ?? [];
      for (const pp of pParticipants) {
        const participantKey = `member:${pp.memberId}`;
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
   * Build a lookup map of member keys to person info for all members of
   * the trip. Names resolve via members LEFT JOIN users with
   * COALESCE(users.display_name, members.guest_display_name) — before a
   * guest is claimed the guest name shows; after claim the profile name
   * shows under the same member:<id> key.
   */
  private async buildPersonMap(
    tripId: string,
  ): Promise<Map<string, BalancePerson>> {
    const personMap = new Map<string, BalancePerson>();

    const memberRows = await this.db
      .select({
        id: members.id,
        name: sql<
          string
        >`coalesce(${users.displayName}, ${members.guestDisplayName}, 'Unknown')`,
      })
      .from(members)
      .leftJoin(users, eq(members.userId, users.id))
      .where(eq(members.tripId, tripId));

    for (const m of memberRows) {
      personMap.set(`member:${m.id}`, {
        id: m.id,
        name: m.name,
      });
    }

    return personMap;
  }
}
