import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import { users, trips, members, payments, paymentParticipants } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";
import { PaymentService } from "@/services/payment.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { GuestMemberService } from "@/services/guest-member.service.js";
import { PaymentMemberNotInTripError } from "@/errors.js";

/**
 * Task 6.1 RED: payment.service member-keyed write path.
 * - create payment with payerMemberId + guest participants -> memberIds stored,
 *   equal split incl. guests
 * - guest as payer (organizer marks guest paid, createdBy stays recording user)
 *   -> payer stored as that member's id
 * - payer/participant memberId not in trip -> 409
 * - update participants re-splits
 */
describe("payment.service member-keyed write path (Task 6.1)", () => {
  const permissionsService = new PermissionsService(db);
  const paymentService = new PaymentService(db, permissionsService);
  const guestMemberService = new GuestMemberService(db, permissionsService);

  let organizerId: string;
  let memberAId: string;
  let tripId: string;
  let organizerMemberId: string;
  let memberAMemberId: string;
  const createdUserPhones: string[] = [];

  const createUser = async (displayName: string) => {
    const phone = generateUniquePhone();
    createdUserPhones.push(phone);
    const [user] = await db
      .insert(users)
      .values({ phoneNumber: phone, displayName })
      .returning();
    return user;
  };

  beforeEach(async () => {
    createdUserPhones.length = 0;
    const organizer = await createUser("Trip Organizer");
    organizerId = organizer.id;
    const memberA = await createUser("Member A");
    memberAId = memberA.id;

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Payment Member Trip",
        destination: "Naples",
        preferredTimezone: "Europe/Rome",
        createdBy: organizerId,
      })
      .returning();
    tripId = trip.id;

    const [orgMember] = await db
      .insert(members)
      .values({ tripId, userId: organizerId, isOrganizer: true })
      .returning();
    organizerMemberId = orgMember!.id;
    const [memberArow] = await db
      .insert(members)
      .values({ tripId, userId: memberAId, isOrganizer: false })
      .returning();
    memberAMemberId = memberArow!.id;
  });

  afterEach(async () => {
    if (tripId) {
      const paymentRows = await db
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.tripId, tripId));
      for (const r of paymentRows) {
        await db
          .delete(paymentParticipants)
          .where(eq(paymentParticipants.paymentId, r.id));
      }
      await db.delete(payments).where(eq(payments.tripId, tripId));
      await db.delete(members).where(eq(members.tripId, tripId));
      await db.delete(trips).where(eq(trips.id, tripId));
    }
    for (const phone of createdUserPhones) {
      await db.delete(users).where(eq(users.phoneNumber, phone));
    }
  });

  it("creates a payment with payerMemberId + guest participants: memberIds stored, equal split incl. guests", async () => {
    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
    });

    const payment = await paymentService.createPayment(
      organizerId,
      tripId,
      {
        description: "Dinner",
        amount: 10001, // odd amount exercises cent rounding
        payerMemberId: organizerMemberId,
        participants: [
          { memberId: organizerMemberId },
          { memberId: memberAMemberId },
          { memberId: guest.id },
        ],
      },
    );

    expect(payment.memberId).toBe(organizerMemberId);
    expect(payment.createdBy).toBe(organizerId);
    expect(payment.participants).toHaveLength(3);
    expect(
      payment.participants.map((p) => p.memberId).sort(),
    ).toEqual([organizerMemberId, memberAMemberId, guest.id].sort());

    // Equal split with remainder cents to the first participant: 3334/3334/3333
    const shares = payment.participants.map((p) => p.shareAmount);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10001);
    expect([...shares].sort((a, b) => b - a)).toEqual([3334, 3334, 3333]);

    // Names resolve: guest keeps guest_display_name
    const guestRow = payment.participants.find((p) => p.memberId === guest.id);
    expect(guestRow!.name).toBe("Mom");
  });

  it("guest as payer: organizer marks that the guest paid, createdBy stays the recording user", async () => {
    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
    });

    const payment = await paymentService.createPayment(
      organizerId,
      tripId,
      {
        description: "Mom paid lunch",
        amount: 6000,
        payerMemberId: guest.id,
        participants: [
          { memberId: guest.id },
          { memberId: memberAMemberId },
        ],
      },
    );

    expect(payment.memberId).toBe(guest.id);
    expect(payment.payerName).toBe("Mom");
    expect(payment.createdBy).toBe(organizerId);
    const shares = payment.participants.map((p) => p.shareAmount).sort();
    expect(shares).toEqual([3000, 3000]);
  });

  it("rejects a payer memberId not in the trip (409)", async () => {
    const outsider = await createUser("Outsider");
    const [outsiderTrip] = await db
      .insert(trips)
      .values({
        name: "Other Trip",
        destination: "Rome",
        preferredTimezone: "Europe/Rome",
        createdBy: outsider.id,
      })
      .returning();
    const [outsiderMember] = await db
      .insert(members)
      .values({ tripId: outsiderTrip.id, userId: outsider.id })
      .returning();

    await expect(
      paymentService.createPayment(organizerId, tripId, {
        description: "Bad payer",
        amount: 1000,
        payerMemberId: outsiderMember!.id,
        participants: [{ memberId: organizerMemberId }],
      }),
    ).rejects.toThrow(PaymentMemberNotInTripError);

    // Cleanup the throwaway trip
    await db.delete(members).where(eq(members.tripId, outsiderTrip.id));
    await db.delete(trips).where(eq(trips.id, outsiderTrip.id));
  });

  it("rejects a participant memberId not in the trip (409)", async () => {
    const strangerMemberId = "00000000-0000-4000-8000-000000000099";
    await expect(
      paymentService.createPayment(organizerId, tripId, {
        description: "Bad participant",
        amount: 1000,
        payerMemberId: organizerMemberId,
        participants: [
          { memberId: organizerMemberId },
          { memberId: strangerMemberId },
        ],
      }),
    ).rejects.toThrow(PaymentMemberNotInTripError);
  });

  it("update participants re-splits shares", async () => {
    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
    });

    const payment = await paymentService.createPayment(
      organizerId,
      tripId,
      {
        description: "Dinner",
        amount: 9000,
        payerMemberId: organizerMemberId,
        participants: [
          { memberId: organizerMemberId },
          { memberId: memberAMemberId },
        ],
      },
    );
    expect(payment.participants.map((p) => p.shareAmount).sort()).toEqual([
      4500, 4500,
    ]);

    const updated = await paymentService.updatePayment(
      organizerId,
      payment.id,
      {
        participants: [
          { memberId: organizerMemberId },
          { memberId: memberAMemberId },
          { memberId: guest.id },
        ],
      },
    );

    expect(updated.participants).toHaveLength(3);
    expect(updated.participants.map((p) => p.shareAmount).sort()).toEqual([
      3000, 3000, 3000,
    ]);
    expect(
      updated.participants.map((p) => p.memberId).sort(),
    ).toEqual([organizerMemberId, memberAMemberId, guest.id].sort());
  });

  it("update rejects a payer/participant memberId not in the trip (409)", async () => {
    const payment = await paymentService.createPayment(
      organizerId,
      tripId,
      {
        description: "Dinner",
        amount: 4000,
        payerMemberId: organizerMemberId,
        participants: [
          { memberId: organizerMemberId },
          { memberId: memberAMemberId },
        ],
      },
    );

    const strangerMemberId = "00000000-0000-4000-8000-000000000098";
    await expect(
      paymentService.updatePayment(organizerId, payment.id, {
        payerMemberId: strangerMemberId,
      }),
    ).rejects.toThrow(PaymentMemberNotInTripError);
    await expect(
      paymentService.updatePayment(organizerId, payment.id, {
        participants: [
          { memberId: organizerMemberId },
          { memberId: strangerMemberId },
        ],
      }),
    ).rejects.toThrow(PaymentMemberNotInTripError);
  });
});
