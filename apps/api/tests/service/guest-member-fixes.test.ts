import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/config/database.js";
import { users, trips, members, invitations, payments } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";
import { GuestMemberService } from "@/services/guest-member.service.js";
import { PaymentService } from "@/services/payment.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { InvitationService } from "@/services/invitation.service.js";
import type { ISMSService } from "@/services/sms.service.js";
import { NotificationService } from "@/services/notification.service.js";
import type { PgBoss } from "pg-boss";
import {
  DuplicateMemberError,
  MemberLimitExceededError,
  GuestHasPaymentsError,
} from "@/errors.js";

/**
 * Fixes sweep: guest-member + invitation accept hardening.
 * - 23505 race backstop on claimGuestMember UPDATE
 * - a live payer payment blocks deleteGuest (409), and deleting the expense
 *   (a real delete, migration `0059`) releases the guest
 * - GuestHasPaymentsError replaces DuplicateMemberError for the payer block
 * - 25-member cap on the acceptInvitation insert leg
 * - createGuest rejects guestPhone with a pending/failed invitation
 */
describe("guest-member fixes sweep", () => {
  const permissionsService = new PermissionsService(db);
  const guestMemberService = new GuestMemberService(db, permissionsService);
  const paymentService = new PaymentService(db, permissionsService);
  // Mocked SMS + queue deps (boss-queue pattern from
  // invitation.service.test.ts): no live SMS or queue jobs fire in tests.
  const mockSmsService = {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  } as unknown as ISMSService;
  const mockBoss = {
    send: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn().mockResolvedValue(undefined),
  } as unknown as PgBoss;
  const invitationService = new InvitationService(
    db,
    permissionsService,
    mockSmsService,
    new NotificationService(db),
    undefined,
    mockBoss,
  );

  let organizerId: string;
  let tripId: string;
  const createdUserPhones: string[] = [];

  const createUser = async (displayName: string, phone?: string) => {
    const p = phone ?? generateUniquePhone();
    createdUserPhones.push(p);
    const [user] = await db
      .insert(users)
      .values({ phoneNumber: p, displayName })
      .returning();
    return user;
  };

  beforeEach(async () => {
    createdUserPhones.length = 0;
    const organizer = await createUser("Fix Sweep Organizer");
    organizerId = organizer.id;
    const [trip] = await db
      .insert(trips)
      .values({
        name: "Fix Sweep Trip",
        destination: "Naples",
        preferredTimezone: "Europe/Rome",
        createdBy: organizerId,
      })
      .returning();
    tripId = trip.id;
    await db
      .insert(members)
      .values({ tripId, userId: organizerId, isOrganizer: true });
  });

  afterEach(async () => {
    if (tripId) {
      await db.delete(payments).where(eq(payments.tripId, tripId));
      await db.delete(invitations).where(eq(invitations.tripId, tripId));
      await db.delete(members).where(eq(members.tripId, tripId));
      await db.delete(trips).where(eq(trips.id, tripId));
    }
    for (const phone of createdUserPhones) {
      await db.delete(users).where(eq(users.phoneNumber, phone));
    }
  });

  it("23505 race: claim loses to a pre-claimed (tripId, userId) row -> alreadyClaimed, no 500", async () => {
    const guestPhone = generateUniquePhone();
    await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
      guestPhone,
    });
    // Simulate the winning concurrent txn: the same user already claimed a
    // (different) member row on this trip, so this claim's UPDATE hits the
    // partial unique index members_trip_user_unique (23505).
    const claimUser = await createUser("Mom Real");
    await db.insert(members).values({ tripId, userId: claimUser.id });

    const result = await db.transaction(async (tx) =>
      guestMemberService.claimGuestMember(tx, {
        tripId,
        userId: claimUser.id,
        guestPhone,
      }),
    );

    expect(result.claimed).toBe(false);
    expect(result.alreadyClaimed).toBe(true);
    expect(result.member?.userId).toBe(claimUser.id);
  });

  it("deleteGuest refuses a live payer, and deleting the expense releases them", async () => {
    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
    });
    const [paid] = await db
      .insert(payments)
      .values({
        tripId,
        description: "Temple tickets",
        amount: 4500,
        memberId: guest.id,
        createdBy: organizerId,
      })
      .returning();

    await expect(
      guestMemberService.deleteGuest(tripId, organizerId, guest.id),
    ).rejects.toThrow(GuestHasPaymentsError);

    // The refusal is only honest while the expense exists. Deleting it is a
    // real delete (`0059`), so the act the message asks for actually clears
    // the block: before this, a soft-deleted row kept the RESTRICT foreign key
    // alive and the guest could never leave the trip again.
    await paymentService.deletePayment(organizerId, paid!.id);

    await guestMemberService.deleteGuest(tripId, organizerId, guest.id);
    expect(
      await db.select().from(members).where(eq(members.id, guest.id)),
    ).toHaveLength(0);
  });

  it("payer-block error is GuestHasPaymentsError (409), not DuplicateMemberError", async () => {
    const guest = await guestMemberService.createGuest(tripId, organizerId, {
      displayName: "Mom",
    });
    await db.insert(payments).values({
      tripId,
      description: "Mom paid",
      amount: 5000,
      memberId: guest.id,
      createdBy: organizerId,
    });

    const err = await guestMemberService
      .deleteGuest(tripId, organizerId, guest.id)
      .catch((e) => e);
    expect(err).toBeInstanceOf(GuestHasPaymentsError);
    expect(err).not.toBeInstanceOf(DuplicateMemberError);
    expect(err.statusCode).toBe(409);
    expect(String(err.message)).toMatch(/reassign or delete them first/);
  });

  it("acceptInvitation insert leg enforces the 25-member cap", async () => {
    // Fill the trip to 25 members (organizer + 24 fillers)
    for (let i = 0; i < 24; i++) {
      const filler = await createUser(`Cap Filler ${i}`);
      await db.insert(members).values({ tripId, userId: filler.id });
    }
    const inviteePhone = generateUniquePhone();
    const [invite] = await db
      .insert(invitations)
      .values({
        tripId,
        inviterId: organizerId,
        inviteePhone,
        status: "pending",
      })
      .returning();
    const invitee = await createUser("Late Joiner", inviteePhone);

    await expect(
      invitationService.acceptInvitation(invite!.id, invitee.id),
    ).rejects.toThrow(MemberLimitExceededError);
  });

  it("createGuest rejects guestPhone with a pending invitation (409)", async () => {
    const invitedPhone = generateUniquePhone();
    await db.insert(invitations).values({
      tripId,
      inviterId: organizerId,
      inviteePhone: invitedPhone,
      status: "pending",
    });

    await expect(
      guestMemberService.createGuest(tripId, organizerId, {
        displayName: "Hidden Mom",
        guestPhone: invitedPhone,
      }),
    ).rejects.toThrow(DuplicateMemberError);
  });

  it("createGuest rejects guestPhone with a failed invitation (409)", async () => {
    const failedPhone = generateUniquePhone();
    await db.insert(invitations).values({
      tripId,
      inviterId: organizerId,
      inviteePhone: failedPhone,
      status: "failed",
    });

    await expect(
      guestMemberService.createGuest(tripId, organizerId, {
        displayName: "Hidden Mom",
        guestPhone: failedPhone,
      }),
    ).rejects.toThrow(DuplicateMemberError);
  });
});
