import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  payments,
  paymentParticipants,
} from "@/db/schema/index.js";
import { eq, or } from "drizzle-orm";
import { BalanceService } from "@/services/balance.service.js";
import { generateUniquePhone } from "../test-utils.js";

const balanceService = new BalanceService(db);

describe("balance.service", () => {
  let phoneA: string;
  let phoneB: string;
  let phoneC: string;
  let userAId: string;
  let userBId: string;
  let userCId: string;
  let memberAId: string;
  let memberBId: string;
  let memberCId: string;
  let tripId: string;

  const cleanup = async () => {
    if (tripId) {
      // Delete in reverse FK order
      const paymentRows = await db
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.tripId, tripId));
      for (const p of paymentRows) {
        await db
          .delete(paymentParticipants)
          .where(eq(paymentParticipants.paymentId, p.id));
      }
      await db.delete(payments).where(eq(payments.tripId, tripId));
      await db.delete(members).where(eq(members.tripId, tripId));
      await db.delete(trips).where(eq(trips.id, tripId));
    }

    const phones = [phoneA, phoneB, phoneC].filter(Boolean);
    if (phones.length > 0) {
      await db
        .delete(users)
        .where(or(...phones.map((p) => eq(users.phoneNumber, p))));
    }
  };

  /** Create a payment keyed by member ids. */
  const createPayment = async (
    payerMemberId: string,
    amount: number,
    shares: { memberId: string; shareAmount: number }[],
    description = "Test payment",
  ) => {
    const [payment] = await db
      .insert(payments)
      .values({
        tripId,
        description,
        amount,
        memberId: payerMemberId,
        createdBy: userAId,
      })
      .returning();
    await db.insert(paymentParticipants).values(
      shares.map((s) => ({
        paymentId: payment!.id,
        memberId: s.memberId,
        shareAmount: s.shareAmount,
      })),
    );
    return payment!;
  };

  beforeEach(async () => {
    phoneA = generateUniquePhone();
    phoneB = generateUniquePhone();
    phoneC = generateUniquePhone();
    await cleanup();

    // Create users
    const [a] = await db
      .insert(users)
      .values({ phoneNumber: phoneA, displayName: "Alice", timezone: "UTC" })
      .returning();
    const [b] = await db
      .insert(users)
      .values({ phoneNumber: phoneB, displayName: "Bob", timezone: "UTC" })
      .returning();
    const [c] = await db
      .insert(users)
      .values({ phoneNumber: phoneC, displayName: "Charlie", timezone: "UTC" })
      .returning();
    userAId = a!.id;
    userBId = b!.id;
    userCId = c!.id;

    // Create trip and members
    const [trip] = await db
      .insert(trips)
      .values({
        name: "Balance Test Trip",
        destination: "Test",
        preferredTimezone: "UTC",
        createdBy: userAId,
      })
      .returning();
    tripId = trip!.id;

    const memberRows = await db
      .insert(members)
      .values([
        { tripId, userId: userAId, status: "going", isOrganizer: true },
        { tripId, userId: userBId, status: "going" },
        { tripId, userId: userCId, status: "going" },
      ])
      .returning();
    memberAId = memberRows.find((m) => m.userId === userAId)!.id;
    memberBId = memberRows.find((m) => m.userId === userBId)!.id;
    memberCId = memberRows.find((m) => m.userId === userCId)!.id;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("should return empty balances when no payments exist", async () => {
    const balances = await balanceService.getTripBalances(tripId);
    expect(balances).toEqual([]);
  });

  it("should compute balance for a single payment with multiple participants", async () => {
    // Alice pays $30 split between Bob and Charlie
    await createPayment(
      memberAId,
      3000,
      [
        { memberId: memberBId, shareAmount: 1500 },
        { memberId: memberCId, shareAmount: 1500 },
      ],
      "Dinner",
    );

    const balances = await balanceService.getTripBalances(tripId);
    expect(balances).toHaveLength(2);

    // Bob owes Alice $15, Charlie owes Alice $15
    const sorted = balances.sort((a, b) => a.from.name.localeCompare(b.from.name));
    expect(sorted[0]).toMatchObject({
      from: { id: memberBId, name: "Bob" },
      to: { id: memberAId, name: "Alice" },
      amount: 1500,
    });
    expect(sorted[1]).toMatchObject({
      from: { id: memberCId, name: "Charlie" },
      to: { id: memberAId, name: "Alice" },
      amount: 1500,
    });
  });

  it("should handle payer as participant (net cancellation)", async () => {
    // Alice pays $30 split among Alice, Bob, Charlie (3 ways)
    await createPayment(
      memberAId,
      3000,
      [
        { memberId: memberAId, shareAmount: 1000 },
        { memberId: memberBId, shareAmount: 1000 },
        { memberId: memberCId, shareAmount: 1000 },
      ],
      "Lunch",
    );

    const balances = await balanceService.getTripBalances(tripId);
    expect(balances).toHaveLength(2);

    // Alice is owed $20 net (paid 30, owes self 10)
    // Bob and Charlie each owe $10
    const sorted = balances.sort((a, b) => a.from.name.localeCompare(b.from.name));
    expect(sorted[0]).toMatchObject({
      from: { name: "Bob" },
      to: { name: "Alice" },
      amount: 1000,
    });
    expect(sorted[1]).toMatchObject({
      from: { name: "Charlie" },
      to: { name: "Alice" },
      amount: 1000,
    });
  });

  it("should return empty balances when all debts are settled", async () => {
    // Alice pays $20 split between Alice and Bob
    await createPayment(
      memberAId,
      2000,
      [
        { memberId: memberAId, shareAmount: 1000 },
        { memberId: memberBId, shareAmount: 1000 },
      ],
      "Coffee",
    );

    // Bob settles by paying Alice $10 (settlement = payment with single participant)
    await createPayment(
      memberBId,
      1000,
      [{ memberId: memberAId, shareAmount: 1000 }],
      "Settlement",
    );

    const balances = await balanceService.getTripBalances(tripId);
    expect(balances).toHaveLength(0);
  });

  it("should handle cent rounding correctly ($1.00 / 3)", async () => {
    // Alice pays $1.00 (100 cents) split 3 ways
    // 100/3 = 33 remainder 1 => first gets 34, rest get 33
    await createPayment(
      memberAId,
      100,
      [
        { memberId: memberAId, shareAmount: 34 },
        { memberId: memberBId, shareAmount: 33 },
        { memberId: memberCId, shareAmount: 33 },
      ],
      "Gum",
    );

    const balances = await balanceService.getTripBalances(tripId);
    // Alice net: 100 - 34 = 66 (owed)
    // Bob net: -33 (owes)
    // Charlie net: -33 (owes)
    expect(balances).toHaveLength(2);
    const totalOwed = balances.reduce((sum, b) => sum + b.amount, 0);
    expect(totalOwed).toBe(66);
  });

  it("should simplify cross-debts between multiple people", async () => {
    // Alice pays $30 for Bob and Charlie (each owes 15)
    await createPayment(
      memberAId,
      3000,
      [
        { memberId: memberBId, shareAmount: 1500 },
        { memberId: memberCId, shareAmount: 1500 },
      ],
      "Dinner",
    );

    // Bob pays $20 for Alice (Alice owes 20)
    await createPayment(
      memberBId,
      2000,
      [{ memberId: memberAId, shareAmount: 2000 }],
      "Lunch",
    );

    const balances = await balanceService.getTripBalances(tripId);

    // Net balances:
    // Alice: +3000 (paid) - 2000 (owes Bob) = +1000
    // Bob: +2000 (paid) - 1500 (owes Alice) = +500
    // Charlie: -1500 (owes Alice)
    // Simplified: Charlie owes Alice 1000, Charlie owes Bob 500
    // Or: Charlie pays Alice 1000, Charlie pays Bob 500
    const totalTransferred = balances.reduce((s, b) => s + b.amount, 0);
    expect(totalTransferred).toBe(1500);
    expect(balances.length).toBeLessThanOrEqual(2);
  });

  it("should exclude soft-deleted payments from balances", async () => {
    // Create a payment and soft-delete it
    const [payment] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Deleted dinner",
        amount: 5000,
        memberId: memberAId,
        createdBy: userAId,
        deletedAt: new Date(),
        deletedBy: userAId,
      })
      .returning();

    await db.insert(paymentParticipants).values([
      { paymentId: payment!.id, memberId: memberBId, shareAmount: 5000 },
    ]);

    const balances = await balanceService.getTripBalances(tripId);
    expect(balances).toHaveLength(0);
  });

  it("guest participant appears in trip balances with guest name", async () => {
    const [guest] = await db
      .insert(members)
      .values({
        tripId,
        userId: null,
        guestDisplayName: "Mom",
        status: "no_response",
      })
      .returning();

    // Alice pays $20 split between Alice and Mom
    await createPayment(
      memberAId,
      2000,
      [
        { memberId: memberAId, shareAmount: 1000 },
        { memberId: guest!.id, shareAmount: 1000 },
      ],
      "Dinner",
    );

    const balances = await balanceService.getTripBalances(tripId);
    expect(balances).toHaveLength(1);
    expect(balances[0]).toMatchObject({
      from: { id: guest!.id, name: "Mom" },
      to: { id: memberAId, name: "Alice" },
      amount: 1000,
    });
  });

  it("guest as payer is owed money under their member id", async () => {
    const [guest] = await db
      .insert(members)
      .values({
        tripId,
        userId: null,
        guestDisplayName: "Mom",
        status: "no_response",
      })
      .returning();

    // Mom pays $30 split between Mom, Alice, Bob
    await createPayment(
      guest!.id,
      3000,
      [
        { memberId: guest!.id, shareAmount: 1000 },
        { memberId: memberAId, shareAmount: 1000 },
        { memberId: memberBId, shareAmount: 1000 },
      ],
      "Mom treats",
    );

    const balances = await balanceService.getTripBalances(tripId);
    expect(balances).toHaveLength(2);
    for (const b of balances) {
      expect(b.to).toMatchObject({ id: guest!.id, name: "Mom" });
    }
    const total = balances.reduce((s, b) => s + b.amount, 0);
    expect(total).toBe(2000);
  });

  it("claimed guest debts resolve under the same member after claim", async () => {
    // Create guest, add a participant row, then claim in place (same row,
    // userId set + guest fields cleared) — balance entry id must be unchanged.
    const [guest] = await db
      .insert(members)
      .values({
        tripId,
        userId: null,
        guestDisplayName: "Mom",
        status: "no_response",
      })
      .returning();
    const guestMemberId = guest!.id;

    await createPayment(
      memberAId,
      2000,
      [
        { memberId: memberAId, shareAmount: 1000 },
        { memberId: guestMemberId, shareAmount: 1000 },
      ],
      "Dinner",
    );

    const before = await balanceService.getTripBalances(tripId);
    expect(before).toHaveLength(1);
    expect(before[0]!.from.id).toBe(guestMemberId);
    expect(before[0]!.from.name).toBe("Mom");

    // Claim: attach a new user (not yet a member) to the guest row in place
    const [newUser] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: "Dana",
        timezone: "UTC",
      })
      .returning();
    await db
      .update(members)
      .set({
        userId: newUser!.id,
        claimedAt: new Date(),
        guestDisplayName: null,
        guestPhone: null,
      })
      .where(eq(members.id, guestMemberId));

    const after = await balanceService.getTripBalances(tripId);
    expect(after).toHaveLength(1);
    // Same member id, name now resolves to the profile name
    expect(after[0]!.from.id).toBe(guestMemberId);
    expect(after[0]!.from.name).toBe("Dana");
    expect(after[0]!.amount).toBe(1000);
    await db.delete(users).where(eq(users.id, newUser!.id));
  });

  describe("getMyBalance", () => {
    it("should return user's net position", async () => {
      // Alice pays $30 split 3 ways
      await createPayment(
        memberAId,
        3000,
        [
          { memberId: memberAId, shareAmount: 1000 },
          { memberId: memberBId, shareAmount: 1000 },
          { memberId: memberCId, shareAmount: 1000 },
        ],
        "Dinner",
      );

      const result = await balanceService.getMyBalance(tripId, userAId);
      // Alice is owed 2000 net (paid 3000, owes self 1000)
      expect(result.netBalance).toBe(2000);
      expect(result.details).toHaveLength(2);
    });

    it("should return zero when user has no payments", async () => {
      const result = await balanceService.getMyBalance(tripId, userAId);
      expect(result.netBalance).toBe(0);
      expect(result.details).toHaveLength(0);
    });

    it("should include debts owed to/by guests", async () => {
      const [guest] = await db
        .insert(members)
        .values({
          tripId,
          userId: null,
          guestDisplayName: "Mom",
          status: "no_response",
        })
        .returning();

      // Alice pays $20 split between Alice and Mom → Mom owes Alice $10
      await createPayment(
        memberAId,
        2000,
        [
          { memberId: memberAId, shareAmount: 1000 },
          { memberId: guest!.id, shareAmount: 1000 },
        ],
        "Dinner",
      );

      const alice = await balanceService.getMyBalance(tripId, userAId);
      expect(alice.netBalance).toBe(1000);
      expect(alice.details).toHaveLength(1);
      expect(alice.details[0]).toMatchObject({
        person: { id: guest!.id, name: "Mom" },
        amount: -1000, // Mom owes Alice → negative from Alice's side per existing convention
      });

      // Bob pays $20 split between Bob and Mom → Mom owes Bob $10
      await createPayment(
        memberBId,
        2000,
        [
          { memberId: memberBId, shareAmount: 1000 },
          { memberId: guest!.id, shareAmount: 1000 },
        ],
        "Lunch",
      );

      const bob = await balanceService.getMyBalance(tripId, userBId);
      expect(bob.netBalance).toBe(1000);
      expect(bob.details).toHaveLength(1);
      expect(bob.details[0]!.person).toMatchObject({
        id: guest!.id,
        name: "Mom",
      });
    });

    it("should return zero for a non-member caller", async () => {
      const outsiderPhone = generateUniquePhone();
      const [outsider] = await db
        .insert(users)
        .values({
          phoneNumber: outsiderPhone,
          displayName: "Outsider",
          timezone: "UTC",
        })
        .returning();
      try {
        const result = await balanceService.getMyBalance(tripId, outsider!.id);
        expect(result).toEqual({ netBalance: 0, details: [] });
      } finally {
        await db.delete(users).where(eq(users.id, outsider!.id));
      }
    });
  });
});
