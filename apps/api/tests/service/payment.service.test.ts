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
import { PaymentService } from "@/services/payment.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { generateUniquePhone } from "../test-utils.js";
import { MemberNotFoundError } from "@/errors.js";

const permissionsService = new PermissionsService(db);
const paymentService = new PaymentService(db, permissionsService);

describe("payment.service", () => {
  let phoneA: string;
  let phoneB: string;
  let userAId: string;
  let userBId: string;
  let memberAId: string;
  let memberBId: string;
  let placeholderMemberId: string;
  let tripId: string;
  const auxTripIds: string[] = [];

  const cleanup = async () => {
    // Clean up auxiliary trips (created by validation tests) first
    for (const auxTripId of auxTripIds.splice(0)) {
      await db.delete(members).where(eq(members.tripId, auxTripId));
      await db.delete(trips).where(eq(trips.id, auxTripId));
    }

    if (tripId) {
      // Delete participants and payments for this trip, then members and trip
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

    const phones = [phoneA, phoneB].filter(Boolean);
    if (phones.length > 0) {
      await db
        .delete(users)
        .where(or(...phones.map((p) => eq(users.phoneNumber, p))));
    }
  };

  beforeEach(async () => {
    phoneA = generateUniquePhone();
    phoneB = generateUniquePhone();
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
    userAId = a!.id;
    userBId = b!.id;

    // Create trip and members (Alice organizer, Bob member, Carol placeholder)
    const [trip] = await db
      .insert(trips)
      .values({
        name: "Payment Test Trip",
        destination: "Test",
        preferredTimezone: "UTC",
        createdBy: userAId,
      })
      .returning();
    tripId = trip!.id;

    const [ma] = await db
      .insert(members)
      .values({ tripId, userId: userAId, status: "going", isOrganizer: true })
      .returning();
    const [mb] = await db
      .insert(members)
      .values({ tripId, userId: userBId, status: "going" })
      .returning();
    const [mp] = await db
      .insert(members)
      .values({
        tripId,
        userId: null,
        displayName: "Carol (TBD)",
        status: "going",
      })
      .returning();
    memberAId = ma!.id;
    memberBId = mb!.id;
    placeholderMemberId = mp!.id;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("creates a payment with a placeholder payer and participants including a placeholder", async () => {
    const payment = await paymentService.createPayment(userAId, tripId, {
      description: "Taxi",
      amount: 3000,
      memberId: placeholderMemberId,
      participants: [
        { memberId: memberAId },
        { memberId: placeholderMemberId },
      ],
    });

    expect(payment.memberId).toBe(placeholderMemberId);
    expect(payment.payerName).toBe("Carol (TBD)");
    expect(payment.payerIsPlaceholder).toBe(true);
    expect(payment.participants).toHaveLength(2);

    const alice = payment.participants.find((p) => p.memberId === memberAId);
    const carol = payment.participants.find(
      (p) => p.memberId === placeholderMemberId,
    );
    expect(alice).toMatchObject({
      shareAmount: 1500,
      name: "Alice",
      isPlaceholder: false,
    });
    expect(carol).toMatchObject({
      shareAmount: 1500,
      name: "Carol (TBD)",
      isPlaceholder: true,
    });
  });

  it("lists payments and resolves payer/participant names and placeholder flags", async () => {
    await paymentService.createPayment(userBId, tripId, {
      description: "Dinner",
      amount: 2000,
      memberId: memberBId,
      participants: [
        { memberId: memberAId },
        { memberId: placeholderMemberId },
      ],
    });

    const paymentsList = await paymentService.getPaymentsByTrip(tripId);
    expect(paymentsList).toHaveLength(1);

    const payment = paymentsList[0]!;
    expect(payment.payerName).toBe("Bob");
    expect(payment.payerIsPlaceholder).toBe(false);

    const alice = payment.participants.find((p) => p.memberId === memberAId);
    const carol = payment.participants.find(
      (p) => p.memberId === placeholderMemberId,
    );
    expect(alice).toMatchObject({
      name: "Alice",
      isPlaceholder: false,
      shareAmount: 1000,
    });
    expect(carol).toMatchObject({
      name: "Carol (TBD)",
      isPlaceholder: true,
      shareAmount: 1000,
    });
  });

  it("rejects a payment whose payer member does not belong to the trip", async () => {
    // Create a separate trip + member that does NOT belong to the target trip
    const [otherTrip] = await db
      .insert(trips)
      .values({
        name: "Other Trip",
        destination: "Elsewhere",
        preferredTimezone: "UTC",
        createdBy: userAId,
      })
      .returning();
    auxTripIds.push(otherTrip!.id);
    const [foreignMember] = await db
      .insert(members)
      .values({ tripId: otherTrip!.id, userId: userAId, status: "going" })
      .returning();

    await expect(
      paymentService.createPayment(userAId, tripId, {
        description: "Bad payment",
        amount: 1000,
        memberId: foreignMember!.id,
        participants: [{ memberId: memberAId }],
      }),
    ).rejects.toThrow(MemberNotFoundError);
  });

  it("rejects a payment with a participant member outside the trip", async () => {
    const [otherTrip] = await db
      .insert(trips)
      .values({
        name: "Other Trip",
        destination: "Elsewhere",
        preferredTimezone: "UTC",
        createdBy: userAId,
      })
      .returning();
    auxTripIds.push(otherTrip!.id);
    const [foreignMember] = await db
      .insert(members)
      .values({ tripId: otherTrip!.id, userId: userAId, status: "going" })
      .returning();

    await expect(
      paymentService.createPayment(userAId, tripId, {
        description: "Bad participant",
        amount: 1000,
        memberId: memberAId,
        participants: [{ memberId: foreignMember!.id }],
      }),
    ).rejects.toThrow(MemberNotFoundError);
  });
});
