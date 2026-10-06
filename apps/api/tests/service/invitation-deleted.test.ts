import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  invitations,
  notifications,
} from "@/db/schema/index.js";
import { and, eq, inArray } from "drizzle-orm";
import { InvitationService } from "@/services/invitation.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { SMSService } from "@/services/sms.service.js";
import { NotificationService } from "@/services/notification.service.js";
import { UserService } from "@/services/user.service.js";
import { generateUniquePhone } from "../test-utils.js";

/**
 * Inviting a deleted account must be a `skipped` answer, not a 22001.
 *
 * Account deletion anonymizes the row and moves the phone number to a
 * `deleted:<uuid>` tombstone (44 characters, which is why
 * `users.phone_number` is varchar(64)) while the `members` rows survive —
 * they are the trip's record of the person. So a deleted account still
 * shares trips, still passes the mutual-verification query, and used to be
 * invited by its *tombstone*: a 44-character value written into
 * `invitations.invitee_phone`, which was varchar(20). Postgres raised 22001,
 * the transaction aborted, and the organizer got a 500 with everyone else in
 * the same batch rolled back.
 *
 * The guard belongs beside the block guard — same shape, same register: the
 * deleted id lands in `skipped`, nothing is created for it, and the rest of
 * the call is untouched. A throw would be a distinguishable answer *and*
 * would take the whole batch down, which is the failure being fixed.
 *
 * Every assertion is scoped to rows this file created: the suite shares one
 * database and accumulates, so a file-wide length of zero would only prove
 * file ordering.
 */
describe("createInvitations with a deleted account", () => {
  const permissionsService = new PermissionsService(db);
  const smsService = new SMSService();
  const notificationService = new NotificationService(db);
  const invitationService = new InvitationService(
    db,
    permissionsService,
    smsService,
    notificationService,
  );
  const userService = new UserService(db);

  let organizerPhone: string;
  let deletedPhone: string;
  let liveMutualPhone: string;

  let organizerId: string;
  let deletedId: string;
  let liveMutualId: string;

  let tripId: string;
  let sharedTripId: string;

  const tripIds = () => [tripId, sharedTripId].filter(Boolean);
  const userIds = () => [organizerId, deletedId, liveMutualId].filter(Boolean);
  const phones = () =>
    [organizerPhone, deletedPhone, liveMutualPhone].filter(Boolean);

  const cleanup = async () => {
    const tIds = tripIds();
    const uIds = userIds();
    const pNumbers = phones();

    if (tIds.length > 0) {
      await db.delete(notifications).where(inArray(notifications.tripId, tIds));
      await db.delete(invitations).where(inArray(invitations.tripId, tIds));
      await db.delete(members).where(inArray(members.tripId, tIds));
      await db.delete(trips).where(inArray(trips.id, tIds));
    }
    if (uIds.length > 0) {
      // The organizer's and the live mutual's rows come out by id as well as
      // by phone: the deleted account's phone is a tombstone by then, so a
      // phone match would leave it behind to accumulate.
      await db.delete(notifications).where(inArray(notifications.userId, uIds));
      await db.delete(users).where(inArray(users.id, uIds));
    }
    if (pNumbers.length > 0) {
      await db.delete(users).where(inArray(users.phoneNumber, pNumbers));
    }
  };

  beforeEach(async () => {
    organizerPhone = generateUniquePhone();
    deletedPhone = generateUniquePhone();
    liveMutualPhone = generateUniquePhone();

    await cleanup();

    const inserted = await db
      .insert(users)
      .values([
        { phoneNumber: organizerPhone, displayName: "Organizer" },
        { phoneNumber: deletedPhone, displayName: "Deletes Later" },
        { phoneNumber: liveMutualPhone, displayName: "Live Mutual" },
      ])
      .returning();

    organizerId = inserted[0]!.id;
    deletedId = inserted[1]!.id;
    liveMutualId = inserted[2]!.id;

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Deletion Invite Trip",
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

    // A second trip the organizer shares with both invitees, so both pass
    // the mutual-verification query in the userIds flow.
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
      { tripId: sharedTripId, userId: deletedId, status: "going" },
      { tripId: sharedTripId, userId: liveMutualId, status: "going" },
    ]);
  });

  afterEach(async () => {
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
        and(eq(notifications.userId, userId), eq(notifications.tripId, tripId)),
      );

  it("skips a deleted account and understands its phone number to be a tombstone", async () => {
    // Delete through the real path, so the row is anonymized exactly the way
    // production does it and the phone really is `deleted:<uuid>`.
    await userService.deleteAccount(deletedId);

    const [deletedRow] = await db
      .select({
        phoneNumber: users.phoneNumber,
        displayName: users.displayName,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, deletedId));

    // The premise of the whole test: a 44-character value, which is 24 more
    // than the phone columns were sized for.
    expect(deletedRow!.deletedAt).not.toBeNull();
    expect(deletedRow!.phoneNumber).toBe(`deleted:${deletedId}`);
    expect(deletedRow!.phoneNumber).toHaveLength(44);

    // This is the regression. Before the guard, the call rejected with
    // Postgres 22001 (value too long for type character varying(20)) — a 500
    // for the organizer, and a rollback of everything else in the call.
    const result = await invitationService.createInvitations(
      organizerId,
      tripId,
      [],
      [deletedId],
    );

    expect(result.skipped).toContain(deletedId);
    expect(result.invitations).toHaveLength(0);
    expect(result.addedMembers).toHaveLength(0);

    // No invitation row (so no tombstone ever reaches invitee_phone), no
    // member row, no notification.
    expect(await invitationPhones()).toHaveLength(0);
    expect(await memberRows(deletedId)).toHaveLength(0);
    expect(await notificationsFor(deletedId)).toHaveLength(0);
  });

  it("leaves a live mutual in the same call invited", async () => {
    // The failure mode was a batch-wide rollback, so the batch has to be
    // observed surviving: one deleted id and one good id in one call.
    await userService.deleteAccount(deletedId);

    const result = await invitationService.createInvitations(
      organizerId,
      tripId,
      [],
      [deletedId, liveMutualId],
    );

    expect(result.skipped).toEqual([deletedId]);
    expect(await invitationPhones()).toEqual([liveMutualPhone]);
    expect(result.invitations.map((i) => i.inviteePhone)).toEqual([
      liveMutualPhone,
    ]);
    expect(result.addedMembers).toEqual([
      { userId: liveMutualId, displayName: "Live Mutual" },
    ]);

    expect(await memberRows(deletedId)).toHaveLength(0);
    expect(await memberRows(liveMutualId)).toHaveLength(1);
    expect(await notificationsFor(liveMutualId)).toHaveLength(1);
  });

  it("still refuses a genuinely live non-mutual with NotAMutualError", async () => {
    // The deleted filter must not have swallowed the mutual check: a live
    // account that shares no trip is still the distinguishable answer the
    // existing contract promises.
    const strangerPhone = generateUniquePhone();
    const [stranger] = await db
      .insert(users)
      .values({ phoneNumber: strangerPhone, displayName: "Stranger" })
      .returning();

    try {
      await expect(
        invitationService.createInvitations(
          organizerId,
          tripId,
          [],
          [stranger!.id],
        ),
      ).rejects.toThrow(/not a mutual/i);

      expect(await invitationPhones()).toHaveLength(0);
    } finally {
      await db.delete(users).where(eq(users.id, stranger!.id));
    }
  });
});
