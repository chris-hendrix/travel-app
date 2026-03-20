import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  invitations,
  events,
  notificationPreferences,
  notifications,
} from "@/db/schema/index.js";
import { eq, or, and } from "drizzle-orm";
import { InvitationService } from "@/services/invitation.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { MockSMSService } from "@/services/sms.service.js";
import { NotificationService } from "@/services/notification.service.js";
import { generateUniquePhone } from "../test-utils.js";
import {
  PermissionDeniedError,
  TripNotFoundError,
  MemberLimitExceededError,
  InvitationNotFoundError,
  MemberNotFoundError,
  CannotRemoveCreatorError,
  LastOrganizerError,
  NotAMutualError,
} from "@/errors.js";
import { QUEUE } from "@/queues/types.js";
import type { PgBoss } from "pg-boss";

// Create service instances with db for testing
const permissionsService = new PermissionsService(db);
const smsService = new MockSMSService();
const notificationService = new NotificationService(db);
const invitationService = new InvitationService(
  db,
  permissionsService,
  smsService,
  notificationService,
);

describe("invitation.service", () => {
  // Use unique test data for each test run to enable parallel execution
  let testOrganizerPhone: string;
  let testMemberPhone: string;
  let testNonMemberPhone: string;

  let testOrganizerId: string;
  let testMemberId: string;
  let testNonMemberId: string;

  let testTripId: string;

  // Clean up test data (safe for parallel execution)
  const cleanup = async () => {
    // Delete in reverse order of foreign key dependencies
    if (testTripId) {
      await db
        .delete(notifications)
        .where(eq(notifications.tripId, testTripId));
      await db
        .delete(notificationPreferences)
        .where(eq(notificationPreferences.tripId, testTripId));
      await db.delete(invitations).where(eq(invitations.tripId, testTripId));
      await db.delete(events).where(eq(events.tripId, testTripId));
      await db.delete(members).where(eq(members.tripId, testTripId));
      await db.delete(trips).where(eq(trips.id, testTripId));
    }

    const phoneNumbers = [
      testOrganizerPhone,
      testMemberPhone,
      testNonMemberPhone,
    ].filter(Boolean);

    if (phoneNumbers.length > 0) {
      await db
        .delete(users)
        .where(
          or(...phoneNumbers.map((phone) => eq(users.phoneNumber, phone))),
        );
    }
  };

  beforeEach(async () => {
    // Generate unique phone numbers for this test run
    testOrganizerPhone = generateUniquePhone();
    testMemberPhone = generateUniquePhone();
    testNonMemberPhone = generateUniquePhone();

    // Clean up any existing data
    await cleanup();

    // Create test users
    const organizerResult = await db
      .insert(users)
      .values({
        phoneNumber: testOrganizerPhone,
        displayName: "Test Organizer",
        timezone: "UTC",
      })
      .returning();
    testOrganizerId = organizerResult[0].id;

    const memberResult = await db
      .insert(users)
      .values({
        phoneNumber: testMemberPhone,
        displayName: "Test Member",
        timezone: "UTC",
      })
      .returning();
    testMemberId = memberResult[0].id;

    const nonMemberResult = await db
      .insert(users)
      .values({
        phoneNumber: testNonMemberPhone,
        displayName: "Test Non-Member",
        timezone: "UTC",
      })
      .returning();
    testNonMemberId = nonMemberResult[0].id;

    // Create a test trip
    const tripResult = await db
      .insert(trips)
      .values({
        name: "Test Trip",
        destination: "Test Destination",
        preferredTimezone: "UTC",
        createdBy: testOrganizerId,
      })
      .returning();
    testTripId = tripResult[0].id;

    // Add organizer as member with isOrganizer: true and status: "going"
    await db.insert(members).values({
      tripId: testTripId,
      userId: testOrganizerId,
      status: "going",
      isOrganizer: true,
    });

    // Add regular member with status: "going"
    await db.insert(members).values({
      tripId: testTripId,
      userId: testMemberId,
      status: "going",
    });
  });

  afterEach(cleanup);

  describe("createInvitations", () => {
    it("should create invitations for new phone numbers", async () => {
      const phone1 = generateUniquePhone();
      const phone2 = generateUniquePhone();

      const result = await invitationService.createInvitations(
        testOrganizerId,
        testTripId,
        [phone1, phone2],
      );

      expect(result.invitations).toHaveLength(2);
      expect(result.skipped).toHaveLength(0);
      expect(result.invitations[0].tripId).toBe(testTripId);
      expect(result.invitations[0].inviterId).toBe(testOrganizerId);
      expect(result.invitations[0].status).toBe("pending");

      // Verify invitation records exist in DB
      const dbInvitations = await db
        .select()
        .from(invitations)
        .where(eq(invitations.tripId, testTripId));
      expect(dbInvitations).toHaveLength(2);

      // Clean up extra phones
      await db.delete(invitations).where(eq(invitations.tripId, testTripId));
      await db
        .delete(users)
        .where(
          or(eq(users.phoneNumber, phone1), eq(users.phoneNumber, phone2)),
        );
    });

    it("should skip already-invited phone numbers", async () => {
      const phone = generateUniquePhone();

      // First invite
      await invitationService.createInvitations(testOrganizerId, testTripId, [
        phone,
      ]);

      // Second invite of same phone
      const result = await invitationService.createInvitations(
        testOrganizerId,
        testTripId,
        [phone],
      );

      expect(result.invitations).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toBe(phone);
    });

    it("should skip phone numbers that are already members", async () => {
      // Try to invite the organizer's phone (already a member)
      const result = await invitationService.createInvitations(
        testOrganizerId,
        testTripId,
        [testOrganizerPhone],
      );

      expect(result.invitations).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toBe(testOrganizerPhone);
    });

    it("should handle mix of existing users, new users, already-invited", async () => {
      // Create an extra user who is NOT a member
      const extraUserPhone = generateUniquePhone();
      await db.insert(users).values({
        phoneNumber: extraUserPhone,
        displayName: "Extra User",
        timezone: "UTC",
      });

      // A phone with no user account
      const newPhone = generateUniquePhone();

      // A phone we'll pre-invite
      const preInvitedPhone = generateUniquePhone();
      await invitationService.createInvitations(testOrganizerId, testTripId, [
        preInvitedPhone,
      ]);

      // Invite all three
      const result = await invitationService.createInvitations(
        testOrganizerId,
        testTripId,
        [extraUserPhone, newPhone, preInvitedPhone],
      );

      // preInvitedPhone should be skipped (already invited)
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped).toContain(preInvitedPhone);

      // extraUserPhone and newPhone should be created
      expect(result.invitations).toHaveLength(2);

      // extraUserPhone should also have a member record created
      const [extraUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phoneNumber, extraUserPhone));
      const extraMember = await db
        .select()
        .from(members)
        .where(
          and(eq(members.tripId, testTripId), eq(members.userId, extraUser.id)),
        );
      expect(extraMember).toHaveLength(1);
      expect(extraMember[0].status).toBe("no_response");

      // Clean up extra users
      await db.delete(users).where(eq(users.phoneNumber, extraUserPhone));
    });

    it("should enforce 25 member limit", async () => {
      // We already have 2 members (organizer + member). Add 22 more to reach 24.
      const extraPhones: string[] = [];
      for (let i = 0; i < 22; i++) {
        const phone = generateUniquePhone();
        extraPhones.push(phone);
        const [user] = await db
          .insert(users)
          .values({
            phoneNumber: phone,
            displayName: `Filler User ${i}`,
            timezone: "UTC",
          })
          .returning();
        await db.insert(members).values({
          tripId: testTripId,
          userId: user.id,
          status: "going",
        });
      }

      // Now we have 24 members. Try to invite 2 more (would be 26)
      const newPhone1 = generateUniquePhone();
      const newPhone2 = generateUniquePhone();

      await expect(
        invitationService.createInvitations(testOrganizerId, testTripId, [
          newPhone1,
          newPhone2,
        ]),
      ).rejects.toThrow(MemberLimitExceededError);

      // Clean up extra users
      await db
        .delete(users)
        .where(or(...extraPhones.map((phone) => eq(users.phoneNumber, phone))));
    });

    it("should throw PermissionDeniedError for non-organizers", async () => {
      const phone = generateUniquePhone();

      await expect(
        invitationService.createInvitations(testNonMemberId, testTripId, [
          phone,
        ]),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw TripNotFoundError for non-existent trip", async () => {
      const phone = generateUniquePhone();

      await expect(
        invitationService.createInvitations(
          testOrganizerId,
          "00000000-0000-0000-0000-000000000000",
          [phone],
        ),
      ).rejects.toThrow(TripNotFoundError);
    });

    it("should create invitation-only for non-existent users (no member record)", async () => {
      // Phone number with no user account
      const newPhone = generateUniquePhone();

      const result = await invitationService.createInvitations(
        testOrganizerId,
        testTripId,
        [newPhone],
      );

      expect(result.invitations).toHaveLength(1);

      // Verify no member record was created for this phone
      // (there's no user with this phone, so no member record should exist)
      const usersWithPhone = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phoneNumber, newPhone));
      expect(usersWithPhone).toHaveLength(0);
    });
  });

  describe("getInvitationsByTrip", () => {
    it("should return invitations for a trip", async () => {
      const phone = generateUniquePhone();
      await invitationService.createInvitations(testOrganizerId, testTripId, [
        phone,
      ]);

      const result = await invitationService.getInvitationsByTrip(testTripId);

      expect(result).toHaveLength(1);
      expect(result[0].tripId).toBe(testTripId);
      expect(result[0].inviteePhone).toBe(phone);
    });

    it("should include invitee names for users that exist", async () => {
      // Create a user, then invite their phone
      const inviteePhone = generateUniquePhone();
      await db.insert(users).values({
        phoneNumber: inviteePhone,
        displayName: "Known Invitee",
        timezone: "UTC",
      });

      await invitationService.createInvitations(testOrganizerId, testTripId, [
        inviteePhone,
      ]);

      const result = await invitationService.getInvitationsByTrip(testTripId);

      expect(result).toHaveLength(1);
      expect(result[0].inviteeName).toBe("Known Invitee");

      // Clean up
      await db.delete(users).where(eq(users.phoneNumber, inviteePhone));
    });
  });

  describe("revokeInvitation", () => {
    it("should revoke an invitation and remove member record", async () => {
      // Create a user and invite them
      const inviteePhone = generateUniquePhone();
      const [inviteeUser] = await db
        .insert(users)
        .values({
          phoneNumber: inviteePhone,
          displayName: "Revokee",
          timezone: "UTC",
        })
        .returning();

      const { invitations: created } =
        await invitationService.createInvitations(testOrganizerId, testTripId, [
          inviteePhone,
        ]);
      expect(created).toHaveLength(1);

      // Verify member record was created
      const membersBefore = await db
        .select()
        .from(members)
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, inviteeUser.id),
          ),
        );
      expect(membersBefore).toHaveLength(1);

      // Revoke
      await invitationService.revokeInvitation(testOrganizerId, created[0].id);

      // Verify invitation deleted
      const remainingInvitations = await db
        .select()
        .from(invitations)
        .where(eq(invitations.id, created[0].id));
      expect(remainingInvitations).toHaveLength(0);

      // Verify member record deleted
      const membersAfter = await db
        .select()
        .from(members)
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, inviteeUser.id),
          ),
        );
      expect(membersAfter).toHaveLength(0);

      // Clean up
      await db.delete(users).where(eq(users.phoneNumber, inviteePhone));
    });

    it("should throw InvitationNotFoundError for non-existent invitation", async () => {
      await expect(
        invitationService.revokeInvitation(
          testOrganizerId,
          "00000000-0000-0000-0000-000000000000",
        ),
      ).rejects.toThrow(InvitationNotFoundError);
    });

    it("should throw PermissionDeniedError for non-organizers", async () => {
      const phone = generateUniquePhone();
      const { invitations: created } =
        await invitationService.createInvitations(testOrganizerId, testTripId, [
          phone,
        ]);

      await expect(
        invitationService.revokeInvitation(testMemberId, created[0].id),
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe("updateRsvp", () => {
    it("should update RSVP status to going", async () => {
      const result = await invitationService.updateRsvp(
        testMemberId,
        testTripId,
        "going",
      );

      expect(result.status).toBe("going");
      expect(result.userId).toBe(testMemberId);
    });

    it("should update RSVP status to maybe", async () => {
      const result = await invitationService.updateRsvp(
        testMemberId,
        testTripId,
        "maybe",
      );

      expect(result.status).toBe("maybe");
    });

    it("should update RSVP status to not_going", async () => {
      const result = await invitationService.updateRsvp(
        testMemberId,
        testTripId,
        "not_going",
      );

      expect(result.status).toBe("not_going");
    });

    it("should return MemberWithProfile with correct fields", async () => {
      const result = await invitationService.updateRsvp(
        testMemberId,
        testTripId,
        "going",
      );

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("userId");
      expect(result).toHaveProperty("displayName");
      expect(result).toHaveProperty("profilePhotoUrl");
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("isOrganizer");
      expect(result).toHaveProperty("createdAt");
      expect(result.displayName).toBe("Test Member");
      expect(result.isOrganizer).toBe(false);
      expect(typeof result.createdAt).toBe("string");
    });

    it("should throw PermissionDeniedError for non-members", async () => {
      await expect(
        invitationService.updateRsvp(testNonMemberId, testTripId, "going"),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should log error when createDefaultPreferences fails but still return updated member", async () => {
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
      };

      const failingNotificationService = {
        ...notificationService,
        createDefaultPreferences: vi
          .fn()
          .mockRejectedValue(new Error("DB connection failed")),
      } as unknown as typeof notificationService;

      const serviceWithLogger = new InvitationService(
        db,
        permissionsService,
        smsService,
        failingNotificationService,
        mockLogger,
      );

      const result = await serviceWithLogger.updateRsvp(
        testMemberId,
        testTripId,
        "going",
      );

      expect(result).toBeDefined();
      expect(result.status).toBe("going");
      expect(result.userId).toBe(testMemberId);
      expect(mockLogger.error).toHaveBeenCalledOnce();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(Error),
        "Failed to create default notification preferences",
      );
    });
  });

  describe("updateRsvp - sharePhone", () => {
    it("should persist sharePhone when provided", async () => {
      await invitationService.updateRsvp(
        testMemberId,
        testTripId,
        "going",
        true,
      );

      // Verify sharePhone is set in the database
      const [memberRecord] = await db
        .select({ sharePhone: members.sharePhone })
        .from(members)
        .where(
          and(eq(members.tripId, testTripId), eq(members.userId, testMemberId)),
        );
      expect(memberRecord.sharePhone).toBe(true);
    });

    it("should not change sharePhone when not provided", async () => {
      // First set sharePhone to true
      await invitationService.updateRsvp(
        testMemberId,
        testTripId,
        "going",
        true, // sharePhone = true
      );

      // Verify sharePhone is now true
      const [before] = await db
        .select({ sharePhone: members.sharePhone })
        .from(members)
        .where(
          and(eq(members.tripId, testTripId), eq(members.userId, testMemberId)),
        );
      expect(before.sharePhone).toBe(true);

      // Now call updateRsvp WITHOUT sharePhone
      await invitationService.updateRsvp(testMemberId, testTripId, "maybe");

      // Verify sharePhone is still true (not reset to false)
      const [after] = await db
        .select({ sharePhone: members.sharePhone })
        .from(members)
        .where(
          and(eq(members.tripId, testTripId), eq(members.userId, testMemberId)),
        );
      expect(after.sharePhone).toBe(true);
    });
  });

  describe("getMySettings", () => {
    it("should return sharePhone for a member", async () => {
      const result = await invitationService.getMySettings(
        testMemberId,
        testTripId,
      );

      expect(result).toEqual({ sharePhone: false, calendarExcluded: false });
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      await expect(
        invitationService.getMySettings(
          "00000000-0000-0000-0000-000000000000",
          testTripId,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe("updateMySettings", () => {
    it("should update and return sharePhone", async () => {
      const result = await invitationService.updateMySettings(
        testMemberId,
        testTripId,
        true,
      );

      expect(result).toEqual({ sharePhone: true, calendarExcluded: false });
    });

    it("should persist the updated value", async () => {
      await invitationService.updateMySettings(testMemberId, testTripId, true);

      const result = await invitationService.getMySettings(
        testMemberId,
        testTripId,
      );

      expect(result).toEqual({ sharePhone: true, calendarExcluded: false });
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      await expect(
        invitationService.updateMySettings(
          "00000000-0000-0000-0000-000000000000",
          testTripId,
          true,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe("getTripMembers", () => {
    it("should return members with profiles", async () => {
      const result = await invitationService.getTripMembers(
        testTripId,
        testOrganizerId,
      );

      expect(result).toHaveLength(2);

      const organizer = result.find((m) => m.userId === testOrganizerId);
      expect(organizer).toBeDefined();
      expect(organizer!.displayName).toBe("Test Organizer");
      expect(organizer!.isOrganizer).toBe(true);
      expect(typeof organizer!.createdAt).toBe("string");

      const member = result.find((m) => m.userId === testMemberId);
      expect(member).toBeDefined();
      expect(member!.displayName).toBe("Test Member");
      expect(member!.isOrganizer).toBe(false);
    });

    it("should include phone numbers for organizers", async () => {
      const result = await invitationService.getTripMembers(
        testTripId,
        testOrganizerId,
      );

      // Organizer should see phone numbers
      for (const m of result) {
        expect(m.phoneNumber).toBeDefined();
        expect(typeof m.phoneNumber).toBe("string");
      }
    });

    it("should NOT include phone numbers for non-organizers", async () => {
      const result = await invitationService.getTripMembers(
        testTripId,
        testMemberId,
      );

      // Regular member should NOT see phone numbers
      for (const m of result) {
        expect(m.phoneNumber).toBeUndefined();
      }
    });

    it("should throw PermissionDeniedError for non-members", async () => {
      await expect(
        invitationService.getTripMembers(testTripId, testNonMemberId),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should include phone number for non-organizer when member has sharePhone=true", async () => {
      // Update organizer's member record to share phone
      await db
        .update(members)
        .set({ sharePhone: true })
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, testOrganizerId),
          ),
        );

      // Call as non-organizer
      const result = await invitationService.getTripMembers(
        testTripId,
        testMemberId,
      );

      // Organizer has sharePhone=true, so non-org should see their phone
      const organizer = result.find((m) => m.userId === testOrganizerId);
      expect(organizer).toBeDefined();
      expect(organizer!.phoneNumber).toBeDefined();

      // testMember still has sharePhone=false, so phone should NOT be visible
      const member = result.find((m) => m.userId === testMemberId);
      expect(member).toBeDefined();
      expect(member!.phoneNumber).toBeUndefined();
    });

    it("should return only going and maybe members for non-organizer when showAllMembers is false", async () => {
      // Trip already has showAllMembers: false by default
      // Create a non-going user
      const nonGoingPhone = generateUniquePhone();
      const [nonGoingUser] = await db
        .insert(users)
        .values({
          phoneNumber: nonGoingPhone,
          displayName: "Not Going User",
          timezone: "UTC",
        })
        .returning();

      await db.insert(members).values({
        tripId: testTripId,
        userId: nonGoingUser.id,
        status: "not_going",
        isOrganizer: false,
      });

      // Call as non-organizer
      const result = await invitationService.getTripMembers(
        testTripId,
        testMemberId,
      );

      // Should NOT contain nonGoingUser
      expect(result.find((m) => m.userId === nonGoingUser.id)).toBeUndefined();

      // Should contain organizer and member (both "going")
      expect(result.find((m) => m.userId === testOrganizerId)).toBeDefined();
      expect(result.find((m) => m.userId === testMemberId)).toBeDefined();

      // Clean up
      await db
        .delete(members)
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, nonGoingUser.id),
          ),
        );
      await db.delete(users).where(eq(users.phoneNumber, nonGoingPhone));
    });

    it("should return all members for non-organizer when showAllMembers is true", async () => {
      // Enable showAllMembers on trip
      await db
        .update(trips)
        .set({ showAllMembers: true })
        .where(eq(trips.id, testTripId));

      // Create a non-going user
      const nonGoingPhone = generateUniquePhone();
      const [nonGoingUser] = await db
        .insert(users)
        .values({
          phoneNumber: nonGoingPhone,
          displayName: "Not Going User",
          timezone: "UTC",
        })
        .returning();

      await db.insert(members).values({
        tripId: testTripId,
        userId: nonGoingUser.id,
        status: "not_going",
        isOrganizer: false,
      });

      // Call as non-organizer
      const result = await invitationService.getTripMembers(
        testTripId,
        testMemberId,
      );

      // Should contain all 3 members including the not_going one
      expect(result).toHaveLength(3);
      expect(result.find((m) => m.userId === nonGoingUser.id)).toBeDefined();
      expect(result.find((m) => m.userId === testOrganizerId)).toBeDefined();
      expect(result.find((m) => m.userId === testMemberId)).toBeDefined();

      // Clean up
      await db
        .delete(members)
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, nonGoingUser.id),
          ),
        );
      await db.delete(users).where(eq(users.phoneNumber, nonGoingPhone));
    });

    it("should return all members for organizer regardless of showAllMembers", async () => {
      // Ensure trip has showAllMembers: false (default)
      // Create a non-going user
      const nonGoingPhone = generateUniquePhone();
      const [nonGoingUser] = await db
        .insert(users)
        .values({
          phoneNumber: nonGoingPhone,
          displayName: "Not Going User",
          timezone: "UTC",
        })
        .returning();

      await db.insert(members).values({
        tripId: testTripId,
        userId: nonGoingUser.id,
        status: "not_going",
        isOrganizer: false,
      });

      // Call as organizer
      const result = await invitationService.getTripMembers(
        testTripId,
        testOrganizerId,
      );

      // Organizer should see all 3 members
      expect(result).toHaveLength(3);
      expect(result.find((m) => m.userId === nonGoingUser.id)).toBeDefined();
      expect(result.find((m) => m.userId === testOrganizerId)).toBeDefined();
      expect(result.find((m) => m.userId === testMemberId)).toBeDefined();

      // Clean up
      await db
        .delete(members)
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, nonGoingUser.id),
          ),
        );
      await db.delete(users).where(eq(users.phoneNumber, nonGoingPhone));
    });
  });

  describe("processPendingInvitations", () => {
    it("should create member records for pending invitations", async () => {
      // Create an invitation for a phone that has no user yet
      const newUserPhone = generateUniquePhone();
      await invitationService.createInvitations(testOrganizerId, testTripId, [
        newUserPhone,
      ]);

      // Now create a user with that phone
      const [newUser] = await db
        .insert(users)
        .values({
          phoneNumber: newUserPhone,
          displayName: "New User",
          timezone: "UTC",
        })
        .returning();

      // Process pending invitations
      await invitationService.processPendingInvitations(
        newUser.id,
        newUserPhone,
      );

      // Verify member record was created
      const memberRecords = await db
        .select()
        .from(members)
        .where(
          and(eq(members.tripId, testTripId), eq(members.userId, newUser.id)),
        );
      expect(memberRecords).toHaveLength(1);
      expect(memberRecords[0].status).toBe("no_response");
      expect(memberRecords[0].isOrganizer).toBe(false);

      // Clean up
      await db.delete(users).where(eq(users.phoneNumber, newUserPhone));
    });

    it("should update invitation status to accepted", async () => {
      const newUserPhone = generateUniquePhone();
      await invitationService.createInvitations(testOrganizerId, testTripId, [
        newUserPhone,
      ]);

      const [newUser] = await db
        .insert(users)
        .values({
          phoneNumber: newUserPhone,
          displayName: "New User",
          timezone: "UTC",
        })
        .returning();

      await invitationService.processPendingInvitations(
        newUser.id,
        newUserPhone,
      );

      // Verify invitation status updated
      const [invitation] = await db
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.tripId, testTripId),
            eq(invitations.inviteePhone, newUserPhone),
          ),
        );
      expect(invitation.status).toBe("accepted");
      expect(invitation.respondedAt).not.toBeNull();

      // Clean up
      await db.delete(users).where(eq(users.phoneNumber, newUserPhone));
    });

    it("should not create duplicate member records", async () => {
      // Invite an existing user's phone (this creates both invitation and member)
      const existingUserPhone = generateUniquePhone();
      const [existingUser] = await db
        .insert(users)
        .values({
          phoneNumber: existingUserPhone,
          displayName: "Existing User",
          timezone: "UTC",
        })
        .returning();

      await invitationService.createInvitations(testOrganizerId, testTripId, [
        existingUserPhone,
      ]);

      // Member record already exists from createInvitations
      // Process again - should not create duplicate
      await invitationService.processPendingInvitations(
        existingUser.id,
        existingUserPhone,
      );

      const memberRecords = await db
        .select()
        .from(members)
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, existingUser.id),
          ),
        );
      expect(memberRecords).toHaveLength(1);

      // Clean up
      await db.delete(users).where(eq(users.phoneNumber, existingUserPhone));
    });

    it("should handle no pending invitations gracefully", async () => {
      // Process invitations for a phone with no pending invitations
      const randomPhone = generateUniquePhone();

      // Should not throw
      await invitationService.processPendingInvitations(
        testMemberId,
        randomPhone,
      );
    });
  });

  describe("removeMember", () => {
    it("should remove a non-organizer member and their invitation", async () => {
      // Create a user and invite them so they have both member and invitation records
      const inviteePhone = generateUniquePhone();
      const [inviteeUser] = await db
        .insert(users)
        .values({
          phoneNumber: inviteePhone,
          displayName: "Removable User",
          timezone: "UTC",
        })
        .returning();

      const { invitations: created } =
        await invitationService.createInvitations(testOrganizerId, testTripId, [
          inviteePhone,
        ]);
      expect(created).toHaveLength(1);

      // Find the member record
      const [memberRecord] = await db
        .select()
        .from(members)
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, inviteeUser.id),
          ),
        );
      expect(memberRecord).toBeDefined();

      // Remove the member
      await invitationService.removeMember(
        testOrganizerId,
        testTripId,
        memberRecord.id,
      );

      // Verify member record deleted
      const membersAfter = await db
        .select()
        .from(members)
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, inviteeUser.id),
          ),
        );
      expect(membersAfter).toHaveLength(0);

      // Verify invitation record deleted
      const invitationsAfter = await db
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.tripId, testTripId),
            eq(invitations.inviteePhone, inviteePhone),
          ),
        );
      expect(invitationsAfter).toHaveLength(0);

      // Clean up
      await db.delete(users).where(eq(users.phoneNumber, inviteePhone));
    });

    it("should remove a member without an invitation record", async () => {
      // testMemberId was added directly (no invitation). Get member record.
      const [memberRecord] = await db
        .select()
        .from(members)
        .where(
          and(eq(members.tripId, testTripId), eq(members.userId, testMemberId)),
        );
      expect(memberRecord).toBeDefined();

      // Remove the member
      await invitationService.removeMember(
        testOrganizerId,
        testTripId,
        memberRecord.id,
      );

      // Verify member record deleted
      const membersAfter = await db
        .select()
        .from(members)
        .where(
          and(eq(members.tripId, testTripId), eq(members.userId, testMemberId)),
        );
      expect(membersAfter).toHaveLength(0);
    });

    it("should throw PermissionDeniedError for non-organizers", async () => {
      // testMemberId is a regular member, not an organizer
      const [memberRecord] = await db
        .select()
        .from(members)
        .where(
          and(eq(members.tripId, testTripId), eq(members.userId, testMemberId)),
        );

      await expect(
        invitationService.removeMember(
          testNonMemberId,
          testTripId,
          memberRecord.id,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw CannotRemoveCreatorError when trying to remove trip creator", async () => {
      // testOrganizerId is the trip creator. Get their member record.
      const [memberRecord] = await db
        .select()
        .from(members)
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, testOrganizerId),
          ),
        );

      // We need a second organizer to perform the removal (so they can be an organizer)
      const secondOrgPhone = generateUniquePhone();
      const [secondOrg] = await db
        .insert(users)
        .values({
          phoneNumber: secondOrgPhone,
          displayName: "Second Organizer",
          timezone: "UTC",
        })
        .returning();
      await db.insert(members).values({
        tripId: testTripId,
        userId: secondOrg.id,
        status: "going",
        isOrganizer: true,
      });

      await expect(
        invitationService.removeMember(
          secondOrg.id,
          testTripId,
          memberRecord.id,
        ),
      ).rejects.toThrow(CannotRemoveCreatorError);

      // Clean up
      await db.delete(users).where(eq(users.phoneNumber, secondOrgPhone));
    });

    it("should throw LastOrganizerError when trying to remove the last organizer", async () => {
      // Make testMemberId an organizer, then try to remove testOrganizerId
      // But wait - testOrganizerId is also the creator. So let's create a different scenario.
      // Create a new organizer who is NOT the creator, then try to remove them
      // when they're the only non-creator organizer and the creator is the other organizer.
      // Actually the simpler approach: make a trip where the organizer is not the creator
      // ... or just test that removing the only co-organizer when there's only 1 organizer fails.

      // The organizer (testOrganizerId) is also the creator. Add a second organizer.
      const coOrgPhone = generateUniquePhone();
      const [coOrg] = await db
        .insert(users)
        .values({
          phoneNumber: coOrgPhone,
          displayName: "Co-Organizer",
          timezone: "UTC",
        })
        .returning();
      await db.insert(members).values({
        tripId: testTripId,
        userId: coOrg.id,
        status: "going",
        isOrganizer: true,
      });

      // Now demote the original organizer to regular member so coOrg is the last organizer
      await db
        .update(members)
        .set({ isOrganizer: false })
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, testOrganizerId),
          ),
        );

      // Get coOrg member record
      const [coOrgMember] = await db
        .select()
        .from(members)
        .where(
          and(eq(members.tripId, testTripId), eq(members.userId, coOrg.id)),
        );

      // Re-promote organizer so they can perform the removal
      await db
        .update(members)
        .set({ isOrganizer: true })
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, testOrganizerId),
          ),
        );

      // Now there are 2 organizers, so removing coOrg should work.
      // Let's set up the real test: only 1 organizer and try to remove them.
      // Demote testOrganizerId again
      await db
        .update(members)
        .set({ isOrganizer: false })
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, testOrganizerId),
          ),
        );

      // Now coOrg is the sole organizer. Try to have coOrg remove themselves.
      // But coOrg is not the creator, so CannotRemoveCreatorError won't fire.
      await expect(
        invitationService.removeMember(coOrg.id, testTripId, coOrgMember.id),
      ).rejects.toThrow(LastOrganizerError);

      // Clean up: restore organizer status and remove coOrg
      await db
        .update(members)
        .set({ isOrganizer: true })
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, testOrganizerId),
          ),
        );
      await db.delete(users).where(eq(users.phoneNumber, coOrgPhone));
    });

    it("should throw MemberNotFoundError for non-existent member", async () => {
      await expect(
        invitationService.removeMember(
          testOrganizerId,
          testTripId,
          "00000000-0000-0000-0000-000000000000",
        ),
      ).rejects.toThrow(MemberNotFoundError);
    });

    it("should throw MemberNotFoundError when memberId belongs to different trip", async () => {
      // Create a second trip with a member
      const trip2Result = await db
        .insert(trips)
        .values({
          name: "Second Trip",
          destination: "Test Destination 2",
          preferredTimezone: "UTC",
          createdBy: testOrganizerId,
        })
        .returning();
      const trip2Id = trip2Result[0].id;

      await db.insert(members).values({
        tripId: trip2Id,
        userId: testOrganizerId,
        status: "going",
        isOrganizer: true,
      });

      const otherMemberPhone = generateUniquePhone();
      const [otherUser] = await db
        .insert(users)
        .values({
          phoneNumber: otherMemberPhone,
          displayName: "Other User",
          timezone: "UTC",
        })
        .returning();
      const [otherMember] = await db
        .insert(members)
        .values({
          tripId: trip2Id,
          userId: otherUser.id,
          status: "going",
        })
        .returning();

      // Try to remove other trip's member from testTripId
      await expect(
        invitationService.removeMember(
          testOrganizerId,
          testTripId,
          otherMember.id,
        ),
      ).rejects.toThrow(MemberNotFoundError);

      // Clean up
      await db.delete(members).where(eq(members.tripId, trip2Id));
      await db.delete(trips).where(eq(trips.id, trip2Id));
      await db.delete(users).where(eq(users.phoneNumber, otherMemberPhone));
    });
  });

  describe("createInvitations (with boss queue)", () => {
    it("should send invitation SMS jobs to queue instead of inline SMS", async () => {
      const mockBoss = {
        send: vi.fn().mockResolvedValue(undefined),
        insert: vi.fn().mockResolvedValue(undefined),
      } as unknown as PgBoss;
      const serviceWithBoss = new InvitationService(
        db,
        permissionsService,
        smsService,
        notificationService,
        undefined,
        mockBoss,
      );

      const phone1 = generateUniquePhone();
      const phone2 = generateUniquePhone();

      const sendMessageSpy = vi.spyOn(smsService, "sendMessage");

      const result = await serviceWithBoss.createInvitations(
        testOrganizerId,
        testTripId,
        [phone1, phone2],
      );

      expect(result.invitations).toHaveLength(2);

      // boss.insert should have been called with the invitation send queue
      expect(mockBoss.insert).toHaveBeenCalledOnce();
      expect(mockBoss.insert).toHaveBeenCalledWith(
        QUEUE.INVITATION_SEND,
        expect.arrayContaining([
          expect.objectContaining({
            data: {
              phoneNumber: phone1,
              message: "You've been invited to a trip on Journiful!",
            },
          }),
          expect.objectContaining({
            data: {
              phoneNumber: phone2,
              message: "You've been invited to a trip on Journiful!",
            },
          }),
        ]),
      );

      // Inline SMS should NOT be called
      expect(sendMessageSpy).not.toHaveBeenCalled();

      sendMessageSpy.mockRestore();

      // Clean up
      await db.delete(invitations).where(eq(invitations.tripId, testTripId));
      await db
        .delete(users)
        .where(
          or(eq(users.phoneNumber, phone1), eq(users.phoneNumber, phone2)),
        );
    });

    it("should not call boss.insert when no new phones to invite", async () => {
      const mockBoss = {
        send: vi.fn().mockResolvedValue(undefined),
        insert: vi.fn().mockResolvedValue(undefined),
      } as unknown as PgBoss;
      const serviceWithBoss = new InvitationService(
        db,
        permissionsService,
        smsService,
        notificationService,
        undefined,
        mockBoss,
      );

      // Invite already-member phone (should be skipped)
      const result = await serviceWithBoss.createInvitations(
        testOrganizerId,
        testTripId,
        [testOrganizerPhone],
      );

      expect(result.invitations).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);

      // boss.insert should NOT be called since there are no new phones
      expect(mockBoss.insert).not.toHaveBeenCalled();
    });
  });

  describe("createInvitations (fallback without boss)", () => {
    it("should send SMS inline when boss is null", async () => {
      const phone = generateUniquePhone();

      const sendMessageSpy = vi.spyOn(smsService, "sendMessage");

      const result = await invitationService.createInvitations(
        testOrganizerId,
        testTripId,
        [phone],
      );

      expect(result.invitations).toHaveLength(1);

      // Inline SMS should be called
      expect(sendMessageSpy).toHaveBeenCalledWith(
        phone,
        "You've been invited to a trip on Journiful!",
      );

      sendMessageSpy.mockRestore();

      // Clean up
      await db.delete(invitations).where(eq(invitations.tripId, testTripId));
    });
  });

  describe("createInvitations (mutual invites via userIds)", () => {
    let mutualUserPhone: string;
    let mutualUserId: string;
    let sharedTripId: string;

    beforeEach(async () => {
      // Create a mutual user (shares another trip with the organizer)
      mutualUserPhone = generateUniquePhone();
      const [mutualUser] = await db
        .insert(users)
        .values({
          phoneNumber: mutualUserPhone,
          displayName: "Mutual Friend",
          timezone: "UTC",
        })
        .returning();
      mutualUserId = mutualUser.id;

      // Create a shared trip where both organizer and mutual are members
      const [sharedTrip] = await db
        .insert(trips)
        .values({
          name: "Shared Trip",
          destination: "Shared Destination",
          preferredTimezone: "UTC",
          createdBy: testOrganizerId,
        })
        .returning();
      sharedTripId = sharedTrip.id;

      await db.insert(members).values([
        {
          tripId: sharedTripId,
          userId: testOrganizerId,
          status: "going",
          isOrganizer: true,
        },
        {
          tripId: sharedTripId,
          userId: mutualUserId,
          status: "going",
          isOrganizer: false,
        },
      ]);
    });

    afterEach(async () => {
      // Clean up shared trip and mutual user
      if (sharedTripId) {
        await db
          .delete(notifications)
          .where(eq(notifications.tripId, sharedTripId));
        await db.delete(members).where(eq(members.tripId, sharedTripId));
        await db.delete(trips).where(eq(trips.id, sharedTripId));
      }
      if (mutualUserPhone) {
        await db.delete(users).where(eq(users.phoneNumber, mutualUserPhone));
      }
    });

    it("should create member record and send mutual_invite notification for mutual user", async () => {
      const result = await invitationService.createInvitations(
        testOrganizerId,
        testTripId,
        [],
        [mutualUserId],
      );

      // No phone-based invitations created
      expect(result.invitations).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);

      // addedMembers should include the mutual
      expect(result.addedMembers).toHaveLength(1);
      expect(result.addedMembers[0].userId).toBe(mutualUserId);
      expect(result.addedMembers[0].displayName).toBe("Mutual Friend");

      // Verify member record was created in DB
      const memberRecords = await db
        .select()
        .from(members)
        .where(
          and(eq(members.tripId, testTripId), eq(members.userId, mutualUserId)),
        );
      expect(memberRecords).toHaveLength(1);
      expect(memberRecords[0].status).toBe("no_response");
      expect(memberRecords[0].isOrganizer).toBe(false);

      // Verify mutual_invite notification was created
      const notificationRecords = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, mutualUserId),
            eq(notifications.tripId, testTripId),
            eq(notifications.type, "mutual_invite"),
          ),
        );
      expect(notificationRecords).toHaveLength(1);
      expect(notificationRecords[0].title).toBe("Trip invitation");
      expect(notificationRecords[0].body).toContain("Test Organizer");
      expect(notificationRecords[0].body).toContain("Test Trip");
    });

    it("should send sms_invite notification for existing user auto-added via phone", async () => {
      // Invite the mutual user via their phone number (existing user gets auto-added)
      const result = await invitationService.createInvitations(
        testOrganizerId,
        testTripId,
        [mutualUserPhone],
      );

      // Phone-based invitation should be created
      expect(result.invitations).toHaveLength(1);

      // addedMembers should include the auto-added user
      expect(result.addedMembers).toHaveLength(1);
      expect(result.addedMembers[0].userId).toBe(mutualUserId);

      // Verify sms_invite notification was created
      const notificationRecords = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, mutualUserId),
            eq(notifications.tripId, testTripId),
            eq(notifications.type, "sms_invite"),
          ),
        );
      expect(notificationRecords).toHaveLength(1);
      expect(notificationRecords[0].title).toBe("Trip invitation");
      expect(notificationRecords[0].body).toContain("Test Organizer");
      expect(notificationRecords[0].body).toContain("Test Trip");
    });

    it("should handle mixed invites (both userIds and phoneNumbers)", async () => {
      const newPhone = generateUniquePhone();

      const result = await invitationService.createInvitations(
        testOrganizerId,
        testTripId,
        [newPhone],
        [mutualUserId],
      );

      // Phone-based invitation created for the new phone
      expect(result.invitations).toHaveLength(1);

      // Mutual user added via userId
      expect(result.addedMembers).toHaveLength(1);
      expect(result.addedMembers[0].userId).toBe(mutualUserId);

      expect(result.skipped).toHaveLength(0);

      // Verify member record for mutual
      const memberRecords = await db
        .select()
        .from(members)
        .where(
          and(eq(members.tripId, testTripId), eq(members.userId, mutualUserId)),
        );
      expect(memberRecords).toHaveLength(1);
    });

    it("should enforce member limit across combined phone and mutual flows", async () => {
      // We already have 2 members (organizer + member). Add 22 more to reach 24.
      const extraPhones: string[] = [];
      for (let i = 0; i < 22; i++) {
        const phone = generateUniquePhone();
        extraPhones.push(phone);
        const [user] = await db
          .insert(users)
          .values({
            phoneNumber: phone,
            displayName: `Filler User ${i}`,
            timezone: "UTC",
          })
          .returning();
        await db.insert(members).values({
          tripId: testTripId,
          userId: user.id,
          status: "going",
        });
      }

      // Now we have 24 members. Try to invite 1 phone + 1 mutual (would be 26)
      const newPhone = generateUniquePhone();

      await expect(
        invitationService.createInvitations(
          testOrganizerId,
          testTripId,
          [newPhone],
          [mutualUserId],
        ),
      ).rejects.toThrow(MemberLimitExceededError);

      // Clean up extra users
      await db
        .delete(users)
        .where(or(...extraPhones.map((phone) => eq(users.phoneNumber, phone))));
    });

    it("should reject non-mutual userId with NotAMutualError", async () => {
      // testNonMemberId is not a mutual of testOrganizerId (doesn't share any trip)
      await expect(
        invitationService.createInvitations(
          testOrganizerId,
          testTripId,
          [],
          [testNonMemberId],
        ),
      ).rejects.toThrow(NotAMutualError);
    });

    it("should skip userIds that are already members of the trip", async () => {
      // testMemberId is already a member of testTripId, but IS a mutual
      // (shares testTripId with organizer). Let's make them share sharedTripId too.
      await db.insert(members).values({
        tripId: sharedTripId,
        userId: testMemberId,
        status: "going",
        isOrganizer: false,
      });

      const result = await invitationService.createInvitations(
        testOrganizerId,
        testTripId,
        [],
        [testMemberId],
      );

      expect(result.invitations).toHaveLength(0);
      expect(result.addedMembers).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toBe(testMemberId);
    });

    it("should return addedMembers for both mutual-added and phone-auto-added users", async () => {
      // Create another mutual user to invite via phone
      const mutualUser2Phone = generateUniquePhone();
      const [mutualUser2] = await db
        .insert(users)
        .values({
          phoneNumber: mutualUser2Phone,
          displayName: "Mutual Friend 2",
          timezone: "UTC",
        })
        .returning();

      // Add mutualUser2 to the shared trip to make them a mutual
      await db.insert(members).values({
        tripId: sharedTripId,
        userId: mutualUser2.id,
        status: "going",
        isOrganizer: false,
      });

      // Invite mutualUser1 via userId, mutualUser2 via phone
      const result = await invitationService.createInvitations(
        testOrganizerId,
        testTripId,
        [mutualUser2Phone],
        [mutualUserId],
      );

      // Should have 1 phone invitation (for mutualUser2Phone)
      expect(result.invitations).toHaveLength(1);

      // Should have 2 addedMembers (one mutual, one phone auto-added)
      expect(result.addedMembers).toHaveLength(2);
      const addedUserIds = result.addedMembers.map((m) => m.userId);
      expect(addedUserIds).toContain(mutualUserId);
      expect(addedUserIds).toContain(mutualUser2.id);

      // Clean up
      await db.delete(users).where(eq(users.phoneNumber, mutualUser2Phone));
    });

    it("should return addedMembers in response for phone-only backwards compatibility", async () => {
      // Phone-only call should include addedMembers (empty if no existing users)
      const newPhone = generateUniquePhone();

      const result = await invitationService.createInvitations(
        testOrganizerId,
        testTripId,
        [newPhone],
      );

      expect(result.invitations).toHaveLength(1);
      expect(result.addedMembers).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });
  });
});
