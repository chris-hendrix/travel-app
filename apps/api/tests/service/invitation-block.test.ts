import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  invitations,
  notifications,
  userBlocks,
} from "@/db/schema/index.js";
import { and, eq, inArray } from "drizzle-orm";
import { InvitationService } from "@/services/invitation.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { SMSService } from "@/services/sms.service.js";
import { NotificationService } from "@/services/notification.service.js";
import { generateUniquePhone } from "../test-utils.js";

/**
 * Task 33 RED: an invitation cannot cross a block.
 *
 * A block is symmetric, so both directions stop here. The refusal is
 * deliberately *silent*: a blocked phone lands in `skipped` with exactly the
 * answer an already-invited number gets, because a distinguishable answer
 * ("you were blocked") is itself the leak. Nothing is written for a blocked
 * counterpart — no invitation row, no member row, no guest claim, no SMS and
 * no notification — while everyone else in the same call is untouched.
 *
 * Every assertion is scoped to rows this file created: the suite shares one
 * database, so a whole-table length of zero would only prove file ordering.
 */
describe("createInvitations across a block (Task 33)", () => {
  const permissionsService = new PermissionsService(db);
  const smsService = new SMSService();
  const notificationService = new NotificationService(db);
  const invitationService = new InvitationService(
    db,
    permissionsService,
    smsService,
    notificationService,
  );

  let organizerPhone: string;
  let blockedMePhone: string; // organizer placed the block
  let blockedYouPhone: string; // this user placed the block on the organizer
  let thirdPhone: string; // unblocked existing user
  let mutualPhone: string; // shares another trip with the organizer

  let organizerId: string;
  let blockedMeId: string;
  let blockedYouId: string;
  let thirdId: string;
  let mutualId: string;

  let tripId: string;
  let sharedTripId: string;

  const tripIds = () => [tripId, sharedTripId].filter(Boolean);
  const userIds = () =>
    [organizerId, blockedMeId, blockedYouId, thirdId, mutualId].filter(
      Boolean,
    );
  const phones = () =>
    [
      organizerPhone,
      blockedMePhone,
      blockedYouPhone,
      thirdPhone,
      mutualPhone,
    ].filter(Boolean);

  const cleanup = async () => {
    const tIds = tripIds();
    const uIds = userIds();
    const pNumbers = phones();

    if (tIds.length > 0) {
      await db.delete(notifications).where(inArray(notifications.tripId, tIds));
      await db
        .delete(notifications)
        .where(inArray(notifications.userId, uIds));
      await db.delete(invitations).where(inArray(invitations.tripId, tIds));
      await db.delete(members).where(inArray(members.tripId, tIds));
      await db.delete(trips).where(inArray(trips.id, tIds));
    }
    if (uIds.length > 0) {
      await db.delete(userBlocks).where(inArray(userBlocks.blockerId, uIds));
      await db.delete(userBlocks).where(inArray(userBlocks.blockedId, uIds));
    }
    if (pNumbers.length > 0) {
      await db.delete(users).where(inArray(users.phoneNumber, pNumbers));
    }
  };

  beforeEach(async () => {
    organizerPhone = generateUniquePhone();
    blockedMePhone = generateUniquePhone();
    blockedYouPhone = generateUniquePhone();
    thirdPhone = generateUniquePhone();
    mutualPhone = generateUniquePhone();

    await cleanup();

    const inserted = await db
      .insert(users)
      .values([
        { phoneNumber: organizerPhone, displayName: "Organizer" },
        { phoneNumber: blockedMePhone, displayName: "Blocked By Organizer" },
        { phoneNumber: blockedYouPhone, displayName: "Blocker Of Organizer" },
        { phoneNumber: thirdPhone, displayName: "Third Party" },
        { phoneNumber: mutualPhone, displayName: "Mutual Friend" },
      ])
      .returning();

    organizerId = inserted[0]!.id;
    blockedMeId = inserted[1]!.id;
    blockedYouId = inserted[2]!.id;
    thirdId = inserted[3]!.id;
    mutualId = inserted[4]!.id;

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Block Trip",
        destination: "Naples",
        preferredTimezone: "Europe/Rome",
        createdBy: organizerId,
      })
      .returning();
    tripId = trip!.id;

    await db.insert(members).values({
      tripId,
      userId: organizerId,
      status: "going",
      isOrganizer: true,
    });

    // A second trip the organizer and the mutual share, so the mutual
    // passes the mutual-verification query.
    const [sharedTrip] = await db
      .insert(trips)
      .values({
        name: "Shared Trip",
        destination: "Lisbon",
        preferredTimezone: "Europe/Lisbon",
        createdBy: organizerId,
      })
      .returning();
    sharedTripId = sharedTrip!.id;

    await db.insert(members).values([
      {
        tripId: sharedTripId,
        userId: organizerId,
        status: "going",
        isOrganizer: true,
      },
      { tripId: sharedTripId, userId: mutualId, status: "going" },
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  /** The rows on `tripId` that concern `userId`. */
  const memberRows = async (userId: string) =>
    db
      .select()
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId)));

  const invitationPhones = async () =>
    (
      await db
        .select({ phone: invitations.inviteePhone })
        .from(invitations)
        .where(eq(invitations.tripId, tripId))
    ).map((r) => r.phone);

  const notificationsFor = async (userId: string) =>
    db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.tripId, tripId),
        ),
      );

  describe("phone flow", () => {
    it("skips a phone whose owner blocked the inviter, in both directions, and leaves the rest of the call alone", async () => {
      // Two independent blocks, one each way round the same inviter.
      await db
        .insert(userBlocks)
        .values([
          { blockerId: blockedMeId, blockedId: organizerId },
          { blockerId: organizerId, blockedId: blockedYouId },
        ]);

      const sendMessageSpy = vi.spyOn(smsService, "sendMessage");

      const result = await invitationService.createInvitations(
        organizerId,
        tripId,
        [blockedMePhone, blockedYouPhone, thirdPhone],
      );

      // Both blocked phones are skipped, by phone — not by user id.
      expect(result.skipped).toContain(blockedMePhone);
      expect(result.skipped).toContain(blockedYouPhone);
      expect(result.skipped).not.toContain(thirdPhone);

      // Nothing at all is created for the blocked pair.
      expect(await invitationPhones()).toEqual([thirdPhone]);
      expect(await memberRows(blockedMeId)).toHaveLength(0);
      expect(await memberRows(blockedYouId)).toHaveLength(0);
      expect(await notificationsFor(blockedMeId)).toHaveLength(0);
      expect(await notificationsFor(blockedYouId)).toHaveLength(0);

      // And no SMS reaches them. The third phone is unaffected and does
      // get its invitation, member row and SMS.
      expect(result.invitations.map((i) => i.inviteePhone)).toEqual([
        thirdPhone,
      ]);
      expect(result.addedMembers).toEqual([
        { userId: thirdId, displayName: "Third Party" },
      ]);
      expect(await memberRows(thirdId)).toHaveLength(1);

      const sentTo = sendMessageSpy.mock.calls.map((c) => c[0]);
      expect(sentTo).not.toContain(blockedMePhone);
      expect(sentTo).not.toContain(blockedYouPhone);
      expect(sentTo).toContain(thirdPhone);
    });

    it("answers exactly like an already-invited number, so a block cannot be read off the response", async () => {
      // X is genuinely already invited; Y's owner is blocked. Both are put
      // in the same call: the caller sees one indistinguishable answer.
      await db.insert(invitations).values({
        tripId,
        inviterId: organizerId,
        inviteePhone: thirdPhone,
        status: "pending" as const,
      });
      await db.insert(userBlocks).values({
        blockerId: blockedMeId,
        blockedId: organizerId,
      });

      const result = await invitationService.createInvitations(
        organizerId,
        tripId,
        [thirdPhone, blockedMePhone],
      );

      expect(result.skipped).toEqual(
        expect.arrayContaining([thirdPhone, blockedMePhone]),
      );
      expect(result.invitations).toHaveLength(0);
      expect(result.addedMembers).toHaveLength(0);

      // The invitation table still holds only X's original row — the
      // blocked phone never gained one.
      expect(await invitationPhones()).toEqual([thirdPhone]);
      expect(await memberRows(blockedMeId)).toHaveLength(0);
    });

    it("does not claim a guest row for a blocked phone", async () => {
      await db.insert(userBlocks).values({
        blockerId: organizerId,
        blockedId: blockedMeId,
      });
      await db.insert(members).values({
        tripId,
        userId: null,
        guestPhone: blockedMePhone,
        guestDisplayName: "Guest Row",
        status: "going",
      });

      const result = await invitationService.createInvitations(
        organizerId,
        tripId,
        [blockedMePhone],
      );

      // Claiming attaches them to the trip, which is the same act as
      // inviting them, so a block stops it too.
      expect(result.skipped).toContain(blockedMePhone);
      expect(result.addedMembers).toHaveLength(0);
      expect(await memberRows(blockedMeId)).toHaveLength(0);
      expect(await invitationPhones()).toHaveLength(0);

      // The guest row itself is untouched (still unclaimed).
      const guestRows = await db
        .select({ userId: members.userId })
        .from(members)
        .where(
          and(
            eq(members.tripId, tripId),
            eq(members.guestPhone, blockedMePhone),
          ),
        );
      expect(guestRows).toHaveLength(1);
      expect(guestRows[0]!.userId).toBeNull();
    });

    it("still invites a phone whose owner is already a member of the trip they share", async () => {
      // A block removes nobody from a trip they already share (D5); this
      // task stops invitations being created, not memberships undone.
      await db.insert(members).values({
        tripId,
        userId: blockedMeId,
        status: "going",
      });
      await db.insert(userBlocks).values({
        blockerId: blockedMeId,
        blockedId: organizerId,
      });

      const result = await invitationService.createInvitations(
        organizerId,
        tripId,
        [blockedMePhone],
      );

      // Already-member is the pre-existing answer, unchanged by the block.
      expect(result.skipped).toContain(blockedMePhone);
      expect(result.invitations).toHaveLength(0);
      expect(await memberRows(blockedMeId)).toHaveLength(1);
    });
  });

  describe("mutual (userIds) flow", () => {
    it("skips a blocked mutual and creates nothing for them", async () => {
      await db.insert(userBlocks).values({
        blockerId: organizerId,
        blockedId: mutualId,
      });

      const sendMessageSpy = vi.spyOn(smsService, "sendMessage");

      const result = await invitationService.createInvitations(
        organizerId,
        tripId,
        [],
        [mutualId],
      );

      expect(result.skipped).toContain(mutualId);
      expect(result.invitations).toHaveLength(0);
      expect(result.addedMembers).toHaveLength(0);
      expect(await invitationPhones()).toHaveLength(0);
      expect(await memberRows(mutualId)).toHaveLength(0);
      expect(await notificationsFor(mutualId)).toHaveLength(0);
      expect(sendMessageSpy.mock.calls.map((c) => c[0])).not.toContain(
        mutualPhone,
      );
    });

    it("does not raise NotAMutualError for a blocked non-mutual — a thrown error would leak the block", async () => {
      // This user shares no trip with the organizer: without the block
      // check, the mutual-verification loop throws NotAMutualError, which is
      // exactly the distinguishable answer the task forbids.
      await db.insert(userBlocks).values({
        blockerId: blockedYouId,
        blockedId: organizerId,
      });

      const result = await invitationService.createInvitations(
        organizerId,
        tripId,
        [],
        [blockedYouId],
      );

      expect(result.skipped).toContain(blockedYouId);
      expect(result.invitations).toHaveLength(0);
      expect(await memberRows(blockedYouId)).toHaveLength(0);
    });

    it("leaves an unblocked mutual in the same call untouched", async () => {
      await db.insert(userBlocks).values({
        blockerId: organizerId,
        blockedId: blockedMeId,
      });

      const result = await invitationService.createInvitations(
        organizerId,
        tripId,
        [],
        [mutualId],
      );

      expect(result.skipped).toHaveLength(0);
      expect(result.invitations.map((i) => i.inviteePhone)).toEqual([
        mutualPhone,
      ]);
      expect(await memberRows(mutualId)).toHaveLength(1);
    });

    it("still refuses a genuinely unblocked non-mutual with NotAMutualError", async () => {
      // The block filter must not have swallowed the real check.
      await expect(
        invitationService.createInvitations(organizerId, tripId, [], [
          blockedYouId,
        ]),
      ).rejects.toThrow(/not a mutual/i);
    });
  });
});