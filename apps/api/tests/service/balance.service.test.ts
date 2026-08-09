import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  payments,
  paymentParticipants,
  tripGuests,
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
      await db.delete(tripGuests).where(eq(tripGuests.tripId, tripId));
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

    await db.insert(members).values([
      { tripId, userId: userAId, status: "going", isOrganizer: true },
      { tripId, userId: userBId, status: "going" },
      { tripId, userId: userCId, status: "going" },
    ]);
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
    const [payment] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Dinner",
        amount: 3000,
        userId: userAId,
        createdBy: userAId,
      })
      .returning();

    await db.insert(paymentParticipants).values([
      { paymentId: payment!.id, userId: userBId, shareAmount: 1500 },
      { paymentId: payment!.id, userId: userCId, shareAmount: 1500 },
    ]);

    const balances = await balanceService.getTripBalances(tripId);
    expect(balances).toHaveLength(2);

    // Bob owes Alice $15, Charlie owes Alice $15
    const sorted = balances.sort((a, b) => a.from.name.localeCompare(b.from.name));
    expect(sorted[0]).toMatchObject({
      from: { name: "Bob", isGuest: false },
      to: { name: "Alice", isGuest: false },
      amount: 1500,
    });
    expect(sorted[1]).toMatchObject({
      from: { name: "Charlie", isGuest: false },
      to: { name: "Alice", isGuest: false },
      amount: 1500,
    });
  });

  it("should handle payer as participant (net cancellation)", async () => {
    // Alice pays $30 split among Alice, Bob, Charlie (3 ways)
    const [payment] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Lunch",
        amount: 3000,
        userId: userAId,
        createdBy: userAId,
      })
      .returning();

    await db.insert(paymentParticipants).values([
      { paymentId: payment!.id, userId: userAId, shareAmount: 1000 },
      { paymentId: payment!.id, userId: userBId, shareAmount: 1000 },
      { paymentId: payment!.id, userId: userCId, shareAmount: 1000 },
    ]);

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
    const [p1] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Coffee",
        amount: 2000,
        userId: userAId,
        createdBy: userAId,
      })
      .returning();

    await db.insert(paymentParticipants).values([
      { paymentId: p1!.id, userId: userAId, shareAmount: 1000 },
      { paymentId: p1!.id, userId: userBId, shareAmount: 1000 },
    ]);

    // Bob settles by paying Alice $10 (settlement = payment with single participant)
    const [p2] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Settlement",
        amount: 1000,
        userId: userBId,
        createdBy: userBId,
      })
      .returning();

    await db.insert(paymentParticipants).values([
      { paymentId: p2!.id, userId: userAId, shareAmount: 1000 },
    ]);

    const balances = await balanceService.getTripBalances(tripId);
    expect(balances).toHaveLength(0);
  });

  it("should handle cent rounding correctly ($1.00 / 3)", async () => {
    // Alice pays $1.00 (100 cents) split 3 ways
    const [payment] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Gum",
        amount: 100,
        userId: userAId,
        createdBy: userAId,
      })
      .returning();

    // 100/3 = 33 remainder 1 => first gets 34, rest get 33
    await db.insert(paymentParticipants).values([
      { paymentId: payment!.id, userId: userAId, shareAmount: 34 },
      { paymentId: payment!.id, userId: userBId, shareAmount: 33 },
      { paymentId: payment!.id, userId: userCId, shareAmount: 33 },
    ]);

    const balances = await balanceService.getTripBalances(tripId);
    // Alice net: 100 - 34 = 66 (owed)
    // Bob net: -33 (owes)
    // Charlie net: -33 (owes)
    expect(balances).toHaveLength(2);
    const totalOwed = balances.reduce((sum, b) => sum + b.amount, 0);
    expect(totalOwed).toBe(66);
  });

  it("should handle guest participants", async () => {
    // Create a guest
    const [guest] = await db
      .insert(tripGuests)
      .values({ tripId, name: "Dave (Guest)", createdBy: userAId })
      .returning();

    // Alice pays $20 split between Alice and Dave
    const [payment] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Taxi",
        amount: 2000,
        userId: userAId,
        createdBy: userAId,
      })
      .returning();

    await db.insert(paymentParticipants).values([
      { paymentId: payment!.id, userId: userAId, shareAmount: 1000 },
      { paymentId: payment!.id, guestId: guest!.id, shareAmount: 1000 },
    ]);

    const balances = await balanceService.getTripBalances(tripId);
    expect(balances).toHaveLength(1);
    expect(balances[0]).toMatchObject({
      from: { name: "Dave (Guest)", isGuest: true },
      to: { name: "Alice", isGuest: false },
      amount: 1000,
    });
  });

  it("should simplify cross-debts between multiple people", async () => {
    // Alice pays $30 for Bob and Charlie (each owes 15)
    const [p1] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Dinner",
        amount: 3000,
        userId: userAId,
        createdBy: userAId,
      })
      .returning();

    await db.insert(paymentParticipants).values([
      { paymentId: p1!.id, userId: userBId, shareAmount: 1500 },
      { paymentId: p1!.id, userId: userCId, shareAmount: 1500 },
    ]);

    // Bob pays $20 for Alice (Alice owes 20)
    const [p2] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Lunch",
        amount: 2000,
        userId: userBId,
        createdBy: userBId,
      })
      .returning();

    await db.insert(paymentParticipants).values([
      { paymentId: p2!.id, userId: userAId, shareAmount: 2000 },
    ]);

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
        userId: userAId,
        createdBy: userAId,
        deletedAt: new Date(),
        deletedBy: userAId,
      })
      .returning();

    await db.insert(paymentParticipants).values([
      { paymentId: payment!.id, userId: userBId, shareAmount: 5000 },
    ]);

    const balances = await balanceService.getTripBalances(tripId);
    expect(balances).toHaveLength(0);
  });

  describe("getMyBalance", () => {
    it("should return user's net position", async () => {
      // Alice pays $30 split 3 ways
      const [payment] = await db
        .insert(payments)
        .values({
          tripId,
          description: "Dinner",
          amount: 3000,
          userId: userAId,
          createdBy: userAId,
        })
        .returning();

      await db.insert(paymentParticipants).values([
        { paymentId: payment!.id, userId: userAId, shareAmount: 1000 },
        { paymentId: payment!.id, userId: userBId, shareAmount: 1000 },
        { paymentId: payment!.id, userId: userCId, shareAmount: 1000 },
      ]);

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
  });
});
