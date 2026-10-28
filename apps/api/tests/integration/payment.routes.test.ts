import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  payments,
  paymentParticipants,
} from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";

describe("Payment Routes", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  async function setupTrip() {
    const organizerPhone = generateUniquePhone();
    const memberPhone = generateUniquePhone();

    const [organizer] = await db
      .insert(users)
      .values({
        phoneNumber: organizerPhone,
        displayName: "Organizer",
        timezone: "UTC",
      })
      .returning();

    const [member] = await db
      .insert(users)
      .values({
        phoneNumber: memberPhone,
        displayName: "Member",
        timezone: "UTC",
      })
      .returning();

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Payment Test Trip",
        destination: "Test",
        preferredTimezone: "UTC",
        createdBy: organizer!.id,
      })
      .returning();

    const [organizerMember] = await db
      .insert(members)
      .values([
        {
          tripId: trip!.id,
          userId: organizer!.id,
          status: "going",
          isOrganizer: true,
        },
        { tripId: trip!.id, userId: member!.id, status: "going" },
      ])
      .returning();

    const memberRows = await db
      .select()
      .from(members)
      .where(eq(members.tripId, trip!.id));
    const organizerMemberRow = memberRows.find(
      (m) => m.userId === organizer!.id,
    )!;
    const plainMemberRow = memberRows.find((m) => m.userId === member!.id)!;
    void organizerMember;

    return {
      organizer: organizer!,
      member: member!,
      trip: trip!,
      organizerMember: organizerMemberRow,
      plainMember: plainMemberRow,
    };
  }

  describe("POST /api/trips/:tripId/payments", () => {
    it("should create a payment and return 201", async () => {
      app = await buildApp();
      const { organizer, trip, organizerMember, plainMember } =
        await setupTrip();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/payments`,
        cookies: { auth_token: token },
        payload: {
          description: "Dinner",
          amount: 3000,
          payerMemberId: organizerMember.id,
          participants: [
            { memberId: organizerMember.id },
            { memberId: plainMember.id },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.payment.description).toBe("Dinner");
      expect(body.payment.amount).toBe(3000);
      expect(body.payment.payerMemberId).toBe(organizerMember.id);
      // A payload with no scope is a custom split, the column default.
      expect(body.payment.splitScope).toBe("custom");
      expect(body.payment.participants).toHaveLength(2);
      // Equal split: 1500 each
      expect(body.payment.participants[0].shareAmount).toBe(1500);
      expect(body.payment.participants[1].shareAmount).toBe(1500);
      // Enriched profile names
      expect(body.payment.payerName).toBe("Organizer");
      const names = body.payment.participants
        .map((p: { name: string }) => p.name)
        .sort();
      expect(names).toEqual(["Member", "Organizer"]);
    });

    it("carries a note over the wire, and clears it with an empty string", async () => {
      app = await buildApp();
      const { organizer, trip, organizerMember } = await setupTrip();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/payments`,
        cookies: { auth_token: token },
        payload: {
          description: "Dinner",
          note: "Venmo",
          amount: 3000,
          payerMemberId: organizerMember.id,
          participants: [{ memberId: organizerMember.id }],
        },
      });

      expect(created.statusCode).toBe(201);
      const createdBody = JSON.parse(created.body);
      // `paymentEntitySchema` is the response serializer, so this line is
      // the only thing that can prove the field reaches the client at all:
      // drop `note` from that schema and this assertion is what fails.
      expect(createdBody.payment.note).toBe("Venmo");

      const cleared = await app.inject({
        method: "PUT",
        url: `/api/payments/${createdBody.payment.id}`,
        cookies: { auth_token: token },
        payload: { note: "" },
      });

      expect(cleared.statusCode).toBe(200);
      expect(JSON.parse(cleared.body).payment.note).toBeNull();
    });

    it("should resolve guest names for guest participant and guest payer", async () => {
      app = await buildApp();
      const { organizer, trip, plainMember } = await setupTrip();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const [guest] = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: null,
          guestDisplayName: "Mom",
          status: "no_response",
        })
        .returning();

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/payments`,
        cookies: { auth_token: token },
        payload: {
          description: "Mom paid lunch",
          amount: 2000,
          payerMemberId: guest!.id,
          participants: [
            { memberId: guest!.id },
            { memberId: plainMember.id },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.payment.payerMemberId).toBe(guest!.id);
      expect(body.payment.payerName).toBe("Mom");
      const guestPart = body.payment.participants.find(
        (p: { memberId: string }) => p.memberId === guest!.id,
      );
      expect(guestPart.name).toBe("Mom");
    });

    it("should resolve profile name for a claimed member", async () => {
      app = await buildApp();
      const { organizer, trip, organizerMember } = await setupTrip();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      // Guest row claimed in place: userId set, guest fields cleared
      const [guest] = await db
        .insert(members)
        .values({
          tripId: trip.id,
          userId: null,
          guestDisplayName: "Mom",
          status: "no_response",
        })
        .returning();

      const claimPhone = generateUniquePhone();
      const [claimedUser] = await db
        .insert(users)
        .values({
          phoneNumber: claimPhone,
          displayName: "Sarah Chen",
          timezone: "UTC",
        })
        .returning();

      await db
        .update(members)
        .set({
          userId: claimedUser!.id,
          guestDisplayName: null,
          guestPhone: null,
          claimedAt: new Date(),
        })
        .where(eq(members.id, guest!.id));

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/payments`,
        cookies: { auth_token: token },
        payload: {
          description: "Claimed dinner",
          amount: 2000,
          payerMemberId: organizerMember.id,
          participants: [
            { memberId: organizerMember.id },
            { memberId: guest!.id },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      const claimedPart = body.payment.participants.find(
        (p: { memberId: string }) => p.memberId === guest!.id,
      );
      expect(claimedPart.name).toBe("Sarah Chen");
    });

    it("creates a scoped payment: resolved participants, no rows, scope echoed", async () => {
      app = await buildApp();
      const { organizer, trip, organizerMember, plainMember } =
        await setupTrip();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/payments`,
        cookies: { auth_token: token },
        payload: {
          description: "Everyone going dinner",
          amount: 3001,
          payerMemberId: organizerMember.id,
          splitScope: "all_going",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.payment.splitScope).toBe("all_going");

      const participants = body.payment.participants as {
        id?: string;
        memberId: string;
        shareAmount: number;
        name: string;
      }[];
      expect(participants.map((p) => p.memberId).sort()).toEqual(
        [organizerMember.id, plainMember.id].sort(),
      );
      // Equal shares to the cent, naming both people — and no row id, because
      // a resolved participant is not a stored record.
      expect(participants.reduce((sum, p) => sum + p.shareAmount, 0)).toBe(
        3001,
      );
      expect(participants.map((p) => p.shareAmount).sort()).toEqual([
        1500, 1501,
      ]);
      expect(participants.map((p) => p.name).sort()).toEqual([
        "Member",
        "Organizer",
      ]);
      expect(participants.every((p) => p.id === undefined)).toBe(true);

      // The scope is the record: nothing was written to the row table.
      expect(
        await db
          .select()
          .from(paymentParticipants)
          .where(eq(paymentParticipants.paymentId, body.payment.id)),
      ).toHaveLength(0);
    });

    it("answers 400 EMPTY_SPLIT when the scope resolves to nobody", async () => {
      app = await buildApp();
      const { organizer, trip, organizerMember } = await setupTrip();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      // Nobody said yes and there is no guest (a guest is in `all_going` by
      // rule), so the scope is empty — a cost shared by nobody is refused.
      // A decline is the only answer that takes someone out of `all_going`,
      // so this is the roster that resolves to nobody.
      await db
        .update(members)
        .set({ status: "not_going" })
        .where(eq(members.tripId, trip.id));

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/payments`,
        cookies: { auth_token: token },
        payload: {
          description: "Nobody's dinner",
          amount: 2000,
          payerMemberId: organizerMember.id,
          splitScope: "all_going",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error.code).toBe("EMPTY_SPLIT");
    });

    it("rejects a PUT that sends both splitScope and participants", async () => {
      app = await buildApp();
      const { organizer, trip, organizerMember } = await setupTrip();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const created = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/payments`,
        cookies: { auth_token: token },
        payload: {
          description: "Dinner",
          amount: 2000,
          payerMemberId: organizerMember.id,
          participants: [{ memberId: organizerMember.id }],
        },
      });
      expect(created.statusCode).toBe(201);
      const paymentId = JSON.parse(created.body).payment.id;

      const response = await app.inject({
        method: "PUT",
        url: `/api/payments/${paymentId}`,
        cookies: { auth_token: token },
        payload: {
          splitScope: "all_going",
          participants: [{ memberId: organizerMember.id }],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should reject legacy userId payloads with 400", async () => {
      app = await buildApp();
      const { organizer, member, trip } = await setupTrip();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/payments`,
        cookies: { auth_token: token },
        payload: {
          description: "Dinner",
          amount: 3000,
          userId: organizer.id,
          participants: [{ userId: organizer.id }, { userId: member.id }],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 401 if not authenticated", async () => {
      app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/payments",
        payload: {
          description: "Test",
          amount: 1000,
          payerMemberId: "550e8400-e29b-41d4-a716-446655440000",
          participants: [
            { memberId: "550e8400-e29b-41d4-a716-446655440000" },
          ],
        },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/trips/:tripId/payments", () => {
    it("should list payments for a trip", async () => {
      app = await buildApp();
      const { organizer, trip, organizerMember, plainMember } =
        await setupTrip();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      // Create a payment directly
      const [payment] = await db
        .insert(payments)
        .values({
          tripId: trip.id,
          description: "Lunch",
          amount: 2000,
          memberId: organizerMember.id,
          createdBy: organizer.id,
        })
        .returning();

      await db.insert(paymentParticipants).values({
        paymentId: payment!.id,
        memberId: plainMember.id,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/payments`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.payments).toHaveLength(1);
      expect(body.payments[0].participants).toHaveLength(1);
      expect(body.payments[0].payerMemberId).toBe(organizerMember.id);
      expect(body.payments[0].payerName).toBe("Organizer");
      expect(body.payments[0].participants[0].memberId).toBe(plainMember.id);
      expect(body.payments[0].participants[0].name).toBe("Member");
    });

    it("should return 403 for a non-member", async () => {
      app = await buildApp();
      const { trip } = await setupTrip();
      const [stranger] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Stranger",
          timezone: "UTC",
        })
        .returning();
      const token = app.jwt.sign({
        sub: stranger!.id,
        name: stranger!.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/payments`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PERMISSION_DENIED");
    });
  });

  describe("DELETE /api/payments/:id", () => {
    it("should soft delete a payment", async () => {
      app = await buildApp();
      const { organizer, trip, organizerMember } = await setupTrip();
      const token = app.jwt.sign({
        sub: organizer.id,
        name: organizer.displayName,
      });

      const [payment] = await db
        .insert(payments)
        .values({
          tripId: trip.id,
          description: "To Delete",
          amount: 1000,
          memberId: organizerMember.id,
          createdBy: organizer.id,
        })
        .returning();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/payments/${payment!.id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      // Gone, not marked: settle hard-deletes (`0059`), so a deleted expense
      // cannot go on blocking the removal of the member who paid it.
      const rows = await db
        .select()
        .from(payments)
        .where(eq(payments.id, payment!.id));
      expect(rows).toHaveLength(0);
    });

    it("should reject delete from non-creator non-organizer", async () => {
      app = await buildApp();
      const { organizer, member, trip, organizerMember } = await setupTrip();

      // Payment created by organizer
      const [payment] = await db
        .insert(payments)
        .values({
          tripId: trip.id,
          description: "Protected",
          amount: 1000,
          memberId: organizerMember.id,
          createdBy: organizer.id,
        })
        .returning();

      // Member tries to delete
      const memberToken = app.jwt.sign({
        sub: member.id,
        name: member.displayName,
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/payments/${payment!.id}`,
        cookies: { auth_token: memberToken },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
