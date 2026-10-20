import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import { users, trips, members, payments, paymentParticipants } from "@/db/schema/index.js";
import { and, eq, ne } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";
import { PaymentService } from "@/services/payment.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { GuestMemberService } from "@/services/guest-member.service.js";
import {
  PaymentMemberNotInTripError,
  DuplicateParticipantError,
  PermissionDeniedError,
  EmptySplitError,
} from "@/errors.js";
import {
  createPaymentSchema,
  updatePaymentSchema,
} from "@journiful/shared/schemas";

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

  it("rejects duplicate participant memberIds on create with 400", async () => {
    const err = await paymentService
      .createPayment(organizerId, tripId, {
        description: "Dinner",
        amount: 4000,
        payerMemberId: organizerMemberId,
        participants: [
          { memberId: memberAMemberId },
          { memberId: memberAMemberId },
        ],
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(DuplicateParticipantError);
    expect(err.statusCode).toBe(400);

    // No orphan payment row left behind
    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.tripId, tripId));
    expect(rows).toHaveLength(0);
  });

  it("rejects duplicate participant memberIds on update with 400", async () => {
    const payment = await paymentService.createPayment(
      organizerId,
      tripId,
      {
        description: "Dinner",
        amount: 4000,
        payerMemberId: organizerMemberId,
        participants: [{ memberId: memberAMemberId }],
      },
    );

    await expect(
      paymentService.updatePayment(organizerId, payment.id, {
        participants: [
          { memberId: memberAMemberId },
          { memberId: memberAMemberId },
        ],
      }),
    ).rejects.toThrow(DuplicateParticipantError);
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

  it("rejects a non-member reading the trip's payments with 403", async () => {
    const outsider = await createUser("Outsider");

    const err = await paymentService
      .getPaymentsByTrip(outsider.id, tripId)
      .catch((e) => e);

    expect(err).toBeInstanceOf(PermissionDeniedError);
    expect(err.statusCode).toBe(403);
  });

  /**
   * The rules live in `shared/schemas/payment.ts` (strip control chars, then
   * an empty-or-whitespace note is null), so each case drives the real wire
   * path: schema parse -> service -> row read back.
   */
  describe("the note on a payment", () => {
    const base = () => ({
      description: "Dinner",
      amount: 4000,
      payerMemberId: organizerMemberId,
      participants: [{ memberId: memberAMemberId }],
    });

    it("reads back the note it was created with", async () => {
      const input = createPaymentSchema.parse({ ...base(), note: "Venmo" });

      const payment = await paymentService.createPayment(
        organizerId,
        tripId,
        input,
      );

      expect(payment.note).toBe("Venmo");

      // And it survives a fresh read, not just the insert's echo
      const [listed] = await paymentService.getPaymentsByTrip(
        organizerId,
        tripId,
      );
      expect(listed!.note).toBe("Venmo");
    });

    it("reads back null when no note was given", async () => {
      const payment = await paymentService.createPayment(
        organizerId,
        tripId,
        createPaymentSchema.parse(base()),
      );

      expect(payment.note).toBeNull();
    });

    it("treats an empty or whitespace-only note as null", async () => {
      const empty = await paymentService.createPayment(
        organizerId,
        tripId,
        createPaymentSchema.parse({ ...base(), note: "" }),
      );
      expect(empty.note).toBeNull();

      const blank = await paymentService.createPayment(
        organizerId,
        tripId,
        createPaymentSchema.parse({ ...base(), note: "   " }),
      );
      expect(blank.note).toBeNull();
    });

    it("strips control characters from a note", async () => {
      const payment = await paymentService.createPayment(
        organizerId,
        tripId,
        createPaymentSchema.parse({ ...base(), note: "Venmo\u0000\u0007 now" }),
      );

      expect(payment.note).toBe("Venmo now");
    });

    it("writes a note on update, and clears it with an empty string", async () => {
      const payment = await paymentService.createPayment(
        organizerId,
        tripId,
        createPaymentSchema.parse(base()),
      );
      expect(payment.note).toBeNull();

      const withNote = await paymentService.updatePayment(
        organizerId,
        payment.id,
        updatePaymentSchema.parse({ note: "Paid by Venmo" }),
      );
      expect(withNote.note).toBe("Paid by Venmo");

      const cleared = await paymentService.updatePayment(
        organizerId,
        payment.id,
        updatePaymentSchema.parse({ note: "" }),
      );
      expect(cleared.note).toBeNull();
    });

    it("rejects a note longer than 280 characters", () => {
      const result = createPaymentSchema.safeParse({
        ...base(),
        note: "x".repeat(281),
      });

      expect(result.success).toBe(false);
      expect(
        createPaymentSchema.safeParse({ ...base(), note: "x".repeat(280) })
          .success,
      ).toBe(true);
    });
  });
});

/**
 * Split scopes (Phase 2, Tasks 5-7). A `custom` payment stores its people in
 * `payment_participants`; the two roster scopes store no rows at all and are
 * re-resolved against the trip's members on every read, so a member added
 * after the expense joins it and a member removed leaves it with no edit.
 *
 * The roster here is deliberately spread across all four RSVP states plus a
 * guest, because the two scopes differ exactly on the three that are not
 * `going` (`shared/utils/split.ts` is the rule).
 */
describe("the split scope on a payment (Tasks 5-7)", () => {
  const permissionsService = new PermissionsService(db);
  const paymentService = new PaymentService(db, permissionsService);
  const guestMemberService = new GuestMemberService(db, permissionsService);

  let organizerId: string;
  let tripId: string;
  let organizerMemberId: string; // going
  let goingMemberId: string; // going
  let maybeMemberId: string; // maybe
  let silentMemberId: string; // no_response
  let declinedMemberId: string; // not_going
  let guestId: string; // userId NULL
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

  const addMember = async (
    displayName: string,
    status: "going" | "maybe" | "no_response" | "not_going",
  ) => {
    const user = await createUser(displayName);
    const [row] = await db
      .insert(members)
      .values({ tripId, userId: user.id, status })
      .returning();
    return row!.id;
  };

  /** The rows a payment stored — a scoped payment must store none. */
  const participantRows = (paymentId: string) =>
    db
      .select()
      .from(paymentParticipants)
      .where(eq(paymentParticipants.paymentId, paymentId));

  const paymentRows = () =>
    db.select().from(payments).where(eq(payments.tripId, tripId));

  beforeEach(async () => {
    createdUserPhones.length = 0;
    const organizer = await createUser("Trip Organizer");
    organizerId = organizer.id;

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Split Scope Trip",
        destination: "Palermo",
        preferredTimezone: "Europe/Rome",
        createdBy: organizerId,
      })
      .returning();
    tripId = trip.id;

    const [orgMember] = await db
      .insert(members)
      .values({ tripId, userId: organizerId, isOrganizer: true, status: "going" })
      .returning();
    organizerMemberId = orgMember!.id;

    goingMemberId = await addMember("Going Member", "going");
    maybeMemberId = await addMember("Maybe Member", "maybe");
    silentMemberId = await addMember("Silent Member", "no_response");
    declinedMemberId = await addMember("Declined Member", "not_going");

    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Guest Marco",
    });
    guestId = guest.id;
  });

  afterEach(async () => {
    if (tripId) {
      for (const r of await paymentRows()) {
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

  // --- Task 5: create ---------------------------------------------------

  it("a scoped create stores no participant rows and splits among every going member plus every guest", async () => {
    const payment = await paymentService.createPayment(organizerId, tripId, {
      description: "Villa",
      amount: 10000,
      payerMemberId: organizerMemberId,
      splitScope: "all_going",
    });

    expect(payment.splitScope).toBe("all_going");
    expect(await participantRows(payment.id)).toHaveLength(0);

    // going + going + guest, in member-id order (`scopeMemberIds`)
    const expected = [organizerMemberId, goingMemberId, guestId].sort();
    expect(payment.participants.map((p) => p.memberId)).toEqual(expected);
    expect(
      payment.participants.map((p) => p.shareAmount).sort((a, b) => b - a),
    ).toEqual([3334, 3333, 3333]);
    expect(
      payment.participants.reduce((sum, p) => sum + p.shareAmount, 0),
    ).toBe(10000);

    // Names resolve from the roster: the guest keeps its display name
    const guest = payment.participants.find((p) => p.memberId === guestId);
    expect(guest!.name).toBe("Guest Marco");

    // A scoped participant is a fact about the roster, not a stored record
    expect(guest!.id).toBeUndefined();
  });

  it("all_invited includes maybe, no_response and not_going", async () => {
    const payment = await paymentService.createPayment(organizerId, tripId, {
      description: "House",
      amount: 6000,
      payerMemberId: organizerMemberId,
      splitScope: "all_invited",
    });

    expect(await participantRows(payment.id)).toHaveLength(0);
    expect(payment.participants.map((p) => p.memberId)).toEqual(
      [
        organizerMemberId,
        goingMemberId,
        maybeMemberId,
        silentMemberId,
        declinedMemberId,
        guestId,
      ].sort(),
    );
    expect(
      payment.participants.reduce((sum, p) => sum + p.shareAmount, 0),
    ).toBe(6000);
    // 6000 / 6 exactly
    expect(payment.participants.every((p) => p.shareAmount === 1000)).toBe(true);
  });

  it("refuses a scope that resolves to nobody with EMPTY_SPLIT", async () => {
    // A second trip whose only member is not going and which has no guest
    const lonely = await createUser("Lonely Organizer");
    const [trip] = await db
      .insert(trips)
      .values({
        name: "Nobody Going",
        destination: "Ragusa",
        preferredTimezone: "Europe/Rome",
        createdBy: lonely.id,
      })
      .returning();
    const [member] = await db
      .insert(members)
      .values({ tripId: trip!.id, userId: lonely.id, status: "maybe" })
      .returning();

    try {
      const err = await paymentService
        .createPayment(lonely.id, trip!.id, {
          description: "Dinner",
          amount: 3000,
          payerMemberId: member!.id,
          splitScope: "all_going",
        })
        .catch((e) => e);

      expect(err).toBeInstanceOf(EmptySplitError);
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("EMPTY_SPLIT");
      // The copy is user-facing if the app ever surfaces it, so it is pinned
      // here: no em dash (`apps/mobile/AGENTS.md`), and the same sentence the
      // form writes when a rule draws nobody (`emptyScopeSentence`).
      expect(err.message).toBe(
        "Nobody is going yet, so there is no one to share it with.",
      );

      // Nothing left behind
      const rows = await db
        .select()
        .from(payments)
        .where(eq(payments.tripId, trip!.id));
      expect(rows).toHaveLength(0);
    } finally {
      await db.delete(members).where(eq(members.tripId, trip!.id));
      await db.delete(trips).where(eq(trips.id, trip!.id));
    }
  });

  it("a custom create is unchanged: rows stored, scope custom", async () => {
    const payment = await paymentService.createPayment(organizerId, tripId, {
      description: "Dinner",
      amount: 5000,
      payerMemberId: organizerMemberId,
      participants: [{ memberId: organizerMemberId }, { memberId: goingMemberId }],
    });

    expect(payment.splitScope).toBe("custom");
    const rows = await participantRows(payment.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.shareAmount).sort()).toEqual([2500, 2500]);
    expect(payment.participants.map((p) => p.shareAmount).sort()).toEqual([
      2500, 2500,
    ]);
    // A custom participant is a stored row, so it still carries its id
    expect(payment.participants.every((p) => typeof p.id === "string")).toBe(
      true,
    );
  });

  it("an unknown payer is still PAYMENT_MEMBER_NOT_IN_TRIP on a scoped create", async () => {
    const strangerMemberId = "00000000-0000-4000-8000-000000000097";

    await expect(
      paymentService.createPayment(organizerId, tripId, {
        description: "Bad payer",
        amount: 1000,
        payerMemberId: strangerMemberId,
        splitScope: "all_invited",
      }),
    ).rejects.toThrow(PaymentMemberNotInTripError);

    expect(await paymentRows()).toHaveLength(0);
  });

  // --- Task 6: update ---------------------------------------------------

  it("an amount change on a scoped row writes no rows and re-derives the shares", async () => {
    const payment = await paymentService.createPayment(organizerId, tripId, {
      description: "Villa",
      amount: 10000,
      payerMemberId: organizerMemberId,
      splitScope: "all_going",
    });

    const updated = await paymentService.updatePayment(organizerId, payment.id, {
      amount: 12000,
    });

    expect(updated.splitScope).toBe("all_going");
    expect(await participantRows(payment.id)).toHaveLength(0);
    expect(updated.participants.map((p) => p.memberId)).toEqual(
      [organizerMemberId, goingMemberId, guestId].sort(),
    );
    expect(
      updated.participants.reduce((sum, p) => sum + p.shareAmount, 0),
    ).toBe(12000);
  });

  it("choose-people writes rows and flips the scope to custom", async () => {
    const payment = await paymentService.createPayment(organizerId, tripId, {
      description: "Villa",
      amount: 9000,
      payerMemberId: organizerMemberId,
      splitScope: "all_going",
    });

    const updated = await paymentService.updatePayment(organizerId, payment.id, {
      splitScope: "custom",
      participants: [
        { memberId: organizerMemberId },
        { memberId: maybeMemberId },
      ],
    });

    expect(updated.splitScope).toBe("custom");
    const rows = await participantRows(payment.id);
    expect(rows.map((r) => r.memberId).sort()).toEqual(
      [organizerMemberId, maybeMemberId].sort(),
    );
    expect(rows.map((r) => r.shareAmount).sort()).toEqual([4500, 4500]);
    expect(updated.participants.map((p) => p.memberId).sort()).toEqual(
      [organizerMemberId, maybeMemberId].sort(),
    );
  });

  it("a participant list with no scope also flips a scoped row to custom", async () => {
    const payment = await paymentService.createPayment(organizerId, tripId, {
      description: "Villa",
      amount: 9000,
      payerMemberId: organizerMemberId,
      splitScope: "all_invited",
    });

    const updated = await paymentService.updatePayment(organizerId, payment.id, {
      participants: [{ memberId: goingMemberId }],
    });

    expect(updated.splitScope).toBe("custom");
    expect(await participantRows(payment.id)).toHaveLength(1);
    expect(updated.participants).toHaveLength(1);
    expect(updated.participants[0]!.shareAmount).toBe(9000);
  });

  it("switching a custom row to a scope deletes its rows", async () => {
    const payment = await paymentService.createPayment(organizerId, tripId, {
      description: "Dinner",
      amount: 6000,
      payerMemberId: organizerMemberId,
      participants: [
        { memberId: organizerMemberId },
        { memberId: goingMemberId },
      ],
    });
    expect(await participantRows(payment.id)).toHaveLength(2);

    const updated = await paymentService.updatePayment(organizerId, payment.id, {
      splitScope: "all_invited",
    });

    expect(updated.splitScope).toBe("all_invited");
    expect(await participantRows(payment.id)).toHaveLength(0);
    expect(updated.participants).toHaveLength(6);
    expect(
      updated.participants.reduce((sum, p) => sum + p.shareAmount, 0),
    ).toBe(6000);
  });

  it("a non-custom scope carrying participants is refused by the schema (400)", () => {
    const both = updatePaymentSchema.safeParse({
      splitScope: "all_going",
      participants: [{ memberId: organizerMemberId }],
    });
    expect(both.success).toBe(false);

    const createBoth = createPaymentSchema.safeParse({
      description: "Dinner",
      amount: 1000,
      payerMemberId: organizerMemberId,
      splitScope: "all_invited",
      participants: [{ memberId: organizerMemberId }],
    });
    expect(createBoth.success).toBe(false);
  });

  it("a bare splitScope custom with no participants is refused by the schema (400)", () => {
    expect(updatePaymentSchema.safeParse({ splitScope: "custom" }).success).toBe(
      false,
    );
    expect(
      createPaymentSchema.safeParse({
        description: "Dinner",
        amount: 1000,
        payerMemberId: organizerMemberId,
        splitScope: "custom",
      }).success,
    ).toBe(false);
  });

  it("a scope-less update leaves the current scope alone", async () => {
    const payment = await paymentService.createPayment(organizerId, tripId, {
      description: "Villa",
      amount: 9000,
      payerMemberId: organizerMemberId,
      splitScope: "all_going",
    });

    const updated = await paymentService.updatePayment(organizerId, payment.id, {
      description: "Villa + cleaning",
      note: "Wire transfer",
    });

    expect(updated.splitScope).toBe("all_going");
    expect(updated.note).toBe("Wire transfer");
    expect(await participantRows(payment.id)).toHaveLength(0);
    expect(updated.participants).toHaveLength(3);

    // And the same for a custom row: its rows survive an unrelated edit
    const custom = await paymentService.createPayment(organizerId, tripId, {
      description: "Dinner",
      amount: 4000,
      payerMemberId: organizerMemberId,
      participants: [
        { memberId: organizerMemberId },
        { memberId: goingMemberId },
      ],
    });
    const renamed = await paymentService.updatePayment(organizerId, custom.id, {
      description: "Dinner out",
    });
    expect(renamed.splitScope).toBe("custom");
    expect(await participantRows(custom.id)).toHaveLength(2);
    expect(renamed.participants.map((p) => p.shareAmount).sort()).toEqual([
      2000, 2000,
    ]);
  });

  it("a custom amount change still re-splits the stored rows", async () => {
    const payment = await paymentService.createPayment(organizerId, tripId, {
      description: "Dinner",
      amount: 6000,
      payerMemberId: organizerMemberId,
      participants: [
        { memberId: organizerMemberId },
        { memberId: goingMemberId },
        { memberId: guestId },
      ],
    });

    const updated = await paymentService.updatePayment(organizerId, payment.id, {
      amount: 9001,
    });

    expect(updated.splitScope).toBe("custom");
    const rows = await participantRows(payment.id);
    expect(rows).toHaveLength(3);
    expect(rows.reduce((sum, r) => sum + r.shareAmount, 0)).toBe(9001);
  });

  // --- Task 7: read -----------------------------------------------------

  it("the list resolves a scoped payment with names and shares and no row id", async () => {
    const payment = await paymentService.createPayment(organizerId, tripId, {
      description: "Villa",
      amount: 10000,
      payerMemberId: organizerMemberId,
      splitScope: "all_going",
    });

    const [listed] = await paymentService.getPaymentsByTrip(organizerId, tripId);

    expect(listed!.id).toBe(payment.id);
    expect(listed!.splitScope).toBe("all_going");
    expect(listed!.payerMemberId).toBe(organizerMemberId);
    expect(listed!.payerName).toBe("Trip Organizer");
    expect(listed!.participants.map((p) => p.memberId)).toEqual(
      [organizerMemberId, goingMemberId, guestId].sort(),
    );
    expect(
      listed!.participants.reduce((sum, p) => sum + p.shareAmount, 0),
    ).toBe(10000);
    const nameById = Object.fromEntries(
      listed!.participants.map((p) => [p.memberId, p.name]),
    );
    expect(nameById).toEqual({
      [organizerMemberId]: "Trip Organizer",
      [goingMemberId]: "Going Member",
      [guestId]: "Guest Marco",
    });
    expect(listed!.participants.every((p) => p.id === undefined)).toBe(true);
  });

  it("a member added after the expense is in the next read", async () => {
    const payment = await paymentService.createPayment(organizerId, tripId, {
      description: "Villa",
      amount: 9000,
      payerMemberId: organizerMemberId,
      splitScope: "all_going",
    });

    const before = await paymentService.getPaymentsByTrip(organizerId, tripId);
    expect(before[0]!.participants).toHaveLength(3);

    const lateGuest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Late Guest",
    });

    const after = await paymentService.getPaymentsByTrip(organizerId, tripId);
    const listed = after.find((p) => p.id === payment.id)!;
    expect(listed.participants).toHaveLength(4);
    expect(listed.participants.map((p) => p.memberId)).toContain(lateGuest.id);
    expect(
      listed.participants.reduce((sum, p) => sum + p.shareAmount, 0),
    ).toBe(9000);
  });

  it("a read that resolves to nobody falls back to the payer alone", async () => {
    // Written straight to the table, because the write path refuses this:
    // a scoped row whose scope later resolves to nobody (a removal cascade)
    // must still read as the payer owing the whole amount, not as nothing.
    const [orphan] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Orphaned scope",
        amount: 4200,
        memberId: organizerMemberId,
        splitScope: "all_going",
        createdBy: organizerId,
      })
      .returning();

    // Take everyone out of `all_going`: no going members left, no guests left.
    // The payment is re-pointed at the new payer first, because `payments`
    // references `members` with ON DELETE RESTRICT.
    const lonely = await createUser("Lonely Payer");
    const [payer] = await db
      .insert(members)
      .values({ tripId, userId: lonely.id, status: "maybe", isOrganizer: true })
      .returning();
    await db
      .update(payments)
      .set({ memberId: payer!.id })
      .where(eq(payments.id, orphan!.id));
    await db
      .delete(members)
      .where(and(eq(members.tripId, tripId), ne(members.id, payer!.id)));

    const [listed] = await paymentService.getPaymentsByTrip(lonely.id, tripId);
    expect(listed!.splitScope).toBe("all_going");
    expect(listed!.participants).toHaveLength(1);
    expect(listed!.participants[0]!.memberId).toBe(payer!.id);
    expect(listed!.participants[0]!.shareAmount).toBe(4200);
  });

  it("restore resolves a scoped payment the same way", async () => {
    const payment = await paymentService.createPayment(organizerId, tripId, {
      description: "Villa",
      amount: 9000,
      payerMemberId: organizerMemberId,
      splitScope: "all_going",
    });

    await paymentService.deletePayment(organizerId, payment.id);
    const restored = await paymentService.restorePayment(organizerId, payment.id);

    expect(restored.splitScope).toBe("all_going");
    expect(restored.participants.map((p) => p.memberId)).toEqual(
      [organizerMemberId, goingMemberId, guestId].sort(),
    );
    expect(
      restored.participants.reduce((sum, p) => sum + p.shareAmount, 0),
    ).toBe(9000);
    expect(restored.participants.every((p) => p.id === undefined)).toBe(true);
  });

  it("a custom payment still reads its stored rows", async () => {
    const payment = await paymentService.createPayment(organizerId, tripId, {
      description: "Dinner",
      amount: 7777,
      payerMemberId: organizerMemberId,
      participants: [
        { memberId: organizerMemberId },
        { memberId: maybeMemberId },
      ],
    });

    const [listed] = await paymentService.getPaymentsByTrip(organizerId, tripId);

    expect(listed!.splitScope).toBe("custom");
    expect(listed!.participants).toHaveLength(2);
    expect(listed!.participants.every((p) => typeof p.id === "string")).toBe(
      true,
    );
    expect(
      listed!.participants.map((p) => p.memberId).sort(),
    ).toEqual([organizerMemberId, maybeMemberId].sort());
    expect(
      listed!.participants.reduce((sum, p) => sum + p.shareAmount, 0),
    ).toBe(7777);
    expect(await participantRows(payment.id)).toHaveLength(2);
  });
});
