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
        shareAmount: 2000,
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

      // Verify soft-deleted
      const [deleted] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, payment!.id));
      expect(deleted!.deletedAt).not.toBeNull();
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

  describe("POST /api/payments/:id/restore", () => {
    it("should restore a soft-deleted payment (organizer)", async () => {
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
          description: "Deleted",
          amount: 1000,
          memberId: organizerMember.id,
          createdBy: organizer.id,
          deletedAt: new Date(),
          deletedBy: organizer.id,
        })
        .returning();

      await db.insert(paymentParticipants).values({
        paymentId: payment!.id,
        memberId: organizerMember.id,
        shareAmount: 1000,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/payments/${payment!.id}/restore`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.payment.deletedAt).toBeNull();
    });
  });
});
