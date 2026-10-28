import { members, users } from "@/db/schema/index.js";
import { eq, and, sql } from "drizzle-orm";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import { loadTripSplits } from "./payment-split.js";
import { PermissionDeniedError } from "../errors.js";

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
  getTripBalances(userId: string, tripId: string): Promise<BalanceEntry[]>;
  getMyBalance(
    userId: string,
    tripId: string,
  ): Promise<{ netBalance: number; details: MyBalanceDetail[] }>;
}

export class BalanceService implements IBalanceService {
  constructor(
    private db: AppDatabase,
    private permissionsService: IPermissionsService,
  ) {}

  async getTripBalances(
    userId: string,
    tripId: string,
  ): Promise<BalanceEntry[]> {
    await this.assertMember(userId, tripId);
    return this.computeTripBalances(tripId);
  }

  async getMyBalance(
    userId: string,
    tripId: string,
  ): Promise<{ netBalance: number; details: MyBalanceDetail[] }> {
    // Assert once, then compute directly — re-asserting through
    // `getTripBalances` would run the membership query twice per call.
    await this.assertMember(userId, tripId);

    // Resolve the caller via their member row: guests (userId NULL rows) are
    // never callers, and the caller key is member:<members.id>.
    const [caller] = await this.db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId)))
      .limit(1);

    if (!caller) {
      // `assertMember` above already proved the row exists, so this is a
      // race: the member row went away between the two reads. It must not
      // fall back to zeros — a 200 with an empty ledger reads as "you owe
      // nothing", which is the opposite of failing closed.
      throw new PermissionDeniedError(
        "Permission denied: only trip members can read a trip's money",
      );
    }

    const balances = await this.computeTripBalances(tripId);
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
   * A trip's money is readable by its members and nobody else. Fails closed:
   * a caller with no member row on the trip gets 403, never an empty ledger.
   */
  private async assertMember(userId: string, tripId: string): Promise<void> {
    const isMember = await this.permissionsService.isMember(userId, tripId);
    if (!isMember) {
      throw new PermissionDeniedError(
        "Permission denied: only trip members can read a trip's money",
      );
    }
  }

  /** The unguarded compute path — callers must have passed `assertMember`. */
  private async computeTripBalances(tripId: string): Promise<BalanceEntry[]> {
    const netBalances = await this.computeNetBalances(tripId);
    const personMap = await this.buildPersonMap(tripId);
    return this.simplifyDebts(netBalances, personMap);
  }

  /**
   * Compute net balance per member across every payment on the trip.
   * Positive = owed money (net payer). Negative = owes money (net debtor).
   * Key format: "member:<members.id>". The payer key comes straight from
   * `payments.memberId` — no join-through-user needed.
   *
   * The shares are **not** computed here, and that is the point: a cost's
   * shares depend on the rest of the trip, so this reads the same
   * `loadTripSplits` the payment list and the expense detail read. A ledger
   * that re-derived a split from the row would be a second opinion on a
   * question with one answer — and the two would differ by a cent as soon as
   * rounding entered it.
   *
   * A `custom` payment's people are its rows and a scoped one's are the
   * roster; `withPayerFallback` is applied inside the resolver, so a split
   * whose people have all left reads as the payer alone rather than crediting
   * them against nobody. `payments` is hard-deleted on settle, so there is no
   * `deleted_at` to filter and no half-visible money.
   */
  private async computeNetBalances(
    tripId: string,
  ): Promise<Map<string, number>> {
    const net = new Map<string, number>();
    const { payments, participants } = await loadTripSplits(this.db, tripId);

    for (const payment of payments) {
      const payerKey = `member:${payment.memberId}`;

      // Payer gains credit for the full amount
      net.set(payerKey, (net.get(payerKey) ?? 0) + payment.amount);

      // Each participant owes their share
      for (const participant of participants.get(payment.id) ?? []) {
        const participantKey = `member:${participant.memberId}`;
        net.set(
          participantKey,
          (net.get(participantKey) ?? 0) - participant.shareAmount,
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
