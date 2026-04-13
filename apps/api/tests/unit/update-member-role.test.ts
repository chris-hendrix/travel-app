import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import { users, trips, members } from "@/db/schema/index.js";
import { eq, and, or } from "drizzle-orm";
import { InvitationService } from "@/services/invitation.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { SMSService } from "@/services/sms.service.js";
import { generateUniquePhone } from "../test-utils.js";
import {
  PermissionDeniedError,
  TripNotFoundError,
  MemberNotFoundError,
  CannotDemoteCreatorError,
  CannotModifyOwnRoleError,
  LastOrganizerError,
} from "@/errors.js";

// Create service instances with db for testing
const permissionsService = new PermissionsService(db);
const smsService = new SMSService();
const invitationService = new InvitationService(
  db,
  permissionsService,
  smsService,
);

describe("updateMemberRole", () => {
  let testOrganizerPhone: string;
  let testMemberPhone: string;
  let testNonMemberPhone: string;

  let testOrganizerId: string;
  let testMemberId: string;
  let testNonMemberId: string;

  let testTripId: string;
  let testMemberRecordId: string;

  const cleanup = async () => {
    if (testTripId) {
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
    testOrganizerPhone = generateUniquePhone();
    testMemberPhone = generateUniquePhone();
    testNonMemberPhone = generateUniquePhone();

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

    // Add organizer as member with isOrganizer: true
    await db.insert(members).values({
      tripId: testTripId,
      userId: testOrganizerId,
      status: "going",
      isOrganizer: true,
    });

    // Add regular member
    const [memberRecord] = await db
      .insert(members)
      .values({
        tripId: testTripId,
        userId: testMemberId,
        status: "going",
      })
      .returning();
    testMemberRecordId = memberRecord.id;
  });

  afterEach(cleanup);

  it("should promote a regular member to co-organizer", async () => {
    const result = await invitationService.updateMemberRole(
      testOrganizerId,
      testTripId,
      testMemberRecordId,
      true,
    );

    expect(result.isOrganizer).toBe(true);
    expect(result.userId).toBe(testMemberId);
    expect(result.displayName).toBe("Test Member");
    expect(typeof result.createdAt).toBe("string");

    // Verify in DB
    const [dbMember] = await db
      .select()
      .from(members)
      .where(eq(members.id, testMemberRecordId));
    expect(dbMember.isOrganizer).toBe(true);
  });

  it("should demote a co-organizer to regular member", async () => {
    // First promote the member
    await db
      .update(members)
      .set({ isOrganizer: true })
      .where(eq(members.id, testMemberRecordId));

    // Now demote them (there are still 2 organizers: testOrganizer + testMember)
    const result = await invitationService.updateMemberRole(
      testOrganizerId,
      testTripId,
      testMemberRecordId,
      false,
    );

    expect(result.isOrganizer).toBe(false);
    expect(result.userId).toBe(testMemberId);

    // Verify in DB
    const [dbMember] = await db
      .select()
      .from(members)
      .where(eq(members.id, testMemberRecordId));
    expect(dbMember.isOrganizer).toBe(false);
  });

  it("should return MemberWithProfile with correct fields", async () => {
    const result = await invitationService.updateMemberRole(
      testOrganizerId,
      testTripId,
      testMemberRecordId,
      true,
    );

    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("userId");
    expect(result).toHaveProperty("displayName");
    expect(result).toHaveProperty("profilePhotoUrl");
    expect(result).toHaveProperty("handles");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("isOrganizer");
    expect(result).toHaveProperty("createdAt");
    expect(result.displayName).toBe("Test Member");
    expect(result.isOrganizer).toBe(true);
    expect(typeof result.createdAt).toBe("string");
  });

  it("should throw CannotDemoteCreatorError when trying to change trip creator role", async () => {
    // Get the organizer's member record (who is the trip creator)
    const [organizerMemberRecord] = await db
      .select()
      .from(members)
      .where(
        and(
          eq(members.tripId, testTripId),
          eq(members.userId, testOrganizerId),
        ),
      );

    // Promote testMember to organizer so they can attempt the change
    await db
      .update(members)
      .set({ isOrganizer: true })
      .where(eq(members.id, testMemberRecordId));

    // testMember tries to demote the creator
    await expect(
      invitationService.updateMemberRole(
        testMemberId,
        testTripId,
        organizerMemberRecord.id,
        false,
      ),
    ).rejects.toThrow(CannotDemoteCreatorError);
  });

  it("should throw CannotDemoteCreatorError when trying to promote trip creator (already organizer)", async () => {
    // Get the organizer's member record (who is the trip creator)
    const [organizerMemberRecord] = await db
      .select()
      .from(members)
      .where(
        and(
          eq(members.tripId, testTripId),
          eq(members.userId, testOrganizerId),
        ),
      );

    // Promote testMember to organizer so they can attempt the change
    await db
      .update(members)
      .set({ isOrganizer: true })
      .where(eq(members.id, testMemberRecordId));

    // testMember tries to promote the creator (no-op but still blocked)
    await expect(
      invitationService.updateMemberRole(
        testMemberId,
        testTripId,
        organizerMemberRecord.id,
        true,
      ),
    ).rejects.toThrow(CannotDemoteCreatorError);
  });

  it("should throw CannotModifyOwnRoleError when trying to modify own role", async () => {
    // Get the organizer's member record
    const [organizerMemberRecord] = await db
      .select()
      .from(members)
      .where(
        and(
          eq(members.tripId, testTripId),
          eq(members.userId, testOrganizerId),
        ),
      );

    await expect(
      invitationService.updateMemberRole(
        testOrganizerId,
        testTripId,
        organizerMemberRecord.id,
        false,
      ),
    ).rejects.toThrow(CannotModifyOwnRoleError);
  });

  it("should throw PermissionDeniedError for non-organizers", async () => {
    await expect(
      invitationService.updateMemberRole(
        testMemberId,
        testTripId,
        testMemberRecordId,
        true,
      ),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("should throw PermissionDeniedError for non-members", async () => {
    await expect(
      invitationService.updateMemberRole(
        testNonMemberId,
        testTripId,
        testMemberRecordId,
        true,
      ),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("should throw TripNotFoundError for non-existent trip", async () => {
    await expect(
      invitationService.updateMemberRole(
        testOrganizerId,
        "00000000-0000-0000-0000-000000000000",
        testMemberRecordId,
        true,
      ),
    ).rejects.toThrow(TripNotFoundError);
  });

  it("should throw MemberNotFoundError for non-existent member", async () => {
    await expect(
      invitationService.updateMemberRole(
        testOrganizerId,
        testTripId,
        "00000000-0000-0000-0000-000000000000",
        true,
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

    // Try to update other trip's member from testTripId
    await expect(
      invitationService.updateMemberRole(
        testOrganizerId,
        testTripId,
        otherMember.id,
        true,
      ),
    ).rejects.toThrow(MemberNotFoundError);

    // Clean up
    await db.delete(members).where(eq(members.tripId, trip2Id));
    await db.delete(trips).where(eq(trips.id, trip2Id));
    await db.delete(users).where(eq(users.phoneNumber, otherMemberPhone));
  });

  it("should throw LastOrganizerError when demoting the last organizer", async () => {
    // Make testMember an organizer and demote testOrganizer
    await db
      .update(members)
      .set({ isOrganizer: true })
      .where(eq(members.id, testMemberRecordId));

    await db
      .update(members)
      .set({ isOrganizer: false })
      .where(
        and(
          eq(members.tripId, testTripId),
          eq(members.userId, testOrganizerId),
        ),
      );

    // Now testMember is the only organizer. Re-promote testOrganizer so they
    // can attempt the demotion.
    await db
      .update(members)
      .set({ isOrganizer: true })
      .where(
        and(
          eq(members.tripId, testTripId),
          eq(members.userId, testOrganizerId),
        ),
      );

    // Now demote testOrganizer again so testMember is the sole organizer
    await db
      .update(members)
      .set({ isOrganizer: false })
      .where(
        and(
          eq(members.tripId, testTripId),
          eq(members.userId, testOrganizerId),
        ),
      );

    // Create a third user who is also an organizer so we can make the request
    const thirdOrgPhone = generateUniquePhone();
    const [thirdOrg] = await db
      .insert(users)
      .values({
        phoneNumber: thirdOrgPhone,
        displayName: "Third Organizer",
        timezone: "UTC",
      })
      .returning();

    await db.insert(members).values({
      tripId: testTripId,
      userId: thirdOrg.id,
      status: "going",
      isOrganizer: true,
    });

    // Now: testMember is organizer, thirdOrg is organizer, testOrganizer is not.
    // Demote thirdOrg so testMember is the last organizer
    await db
      .update(members)
      .set({ isOrganizer: false })
      .where(
        and(eq(members.tripId, testTripId), eq(members.userId, thirdOrg.id)),
      );

    // Re-promote thirdOrg so they can make the request
    await db
      .update(members)
      .set({ isOrganizer: true })
      .where(
        and(eq(members.tripId, testTripId), eq(members.userId, thirdOrg.id)),
      );

    // Now testMember and thirdOrg are both organizers.
    // Demote thirdOrg, leaving testMember as sole organizer
    // Actually, let me simplify: have 2 organizers, demote one to leave 1
    // Then try to demote the last one.

    // Reset state: testOrganizer=false, testMember=true, thirdOrg=false
    await db
      .update(members)
      .set({ isOrganizer: false })
      .where(
        and(eq(members.tripId, testTripId), eq(members.userId, thirdOrg.id)),
      );

    // testMember is the last organizer. We need someone who IS an organizer
    // to try to demote them. But testMember is the only organizer, and they
    // can't demote themselves (CannotModifyOwnRoleError).
    // So we need to make thirdOrg an organizer too, then try to demote testMember
    // when testMember is the last... wait, that won't work because thirdOrg would also be an organizer.

    // The correct test: have exactly 1 organizer (testMember), and another
    // organizer (thirdOrg) tries to demote them. But if thirdOrg is also an
    // organizer, testMember isn't the last one. So we need thirdOrg to be
    // an organizer and testMember to be the ONLY OTHER organizer...
    // Actually: make both organizers, then thirdOrg tries to demote testMember.
    // At that point there are 2 organizers, so it should succeed.
    // To test LastOrganizerError: make testMember the only organizer,
    // but then no one else CAN be an organizer to make the request. Unless
    // the trip creator (testOrganizer) is treated as organizer by permissionsService.

    // Actually, permissionsService.isOrganizer checks if user is trip creator OR
    // has isOrganizer=true. So testOrganizer (the creator) always passes the
    // organizer check even if isOrganizer=false on their member record.

    // So: testOrganizer (creator, isOrganizer=false) can still make the request.
    // testMember is the ONLY member with isOrganizer=true.
    // Trying to demote testMember should throw LastOrganizerError.

    // Clean up thirdOrg
    await db
      .delete(members)
      .where(
        and(eq(members.tripId, testTripId), eq(members.userId, thirdOrg.id)),
      );
    await db.delete(users).where(eq(users.phoneNumber, thirdOrgPhone));

    // State: testOrganizer (creator, isOrganizer=false), testMember (isOrganizer=true)
    // testOrganizer can make the request because they're the trip creator
    await expect(
      invitationService.updateMemberRole(
        testOrganizerId,
        testTripId,
        testMemberRecordId,
        false,
      ),
    ).rejects.toThrow(LastOrganizerError);
  });

  it("should not throw LastOrganizerError when demoting with multiple organizers", async () => {
    // Promote testMember to organizer
    await db
      .update(members)
      .set({ isOrganizer: true })
      .where(eq(members.id, testMemberRecordId));

    // Now there are 2 organizers. Demoting testMember should work.
    const result = await invitationService.updateMemberRole(
      testOrganizerId,
      testTripId,
      testMemberRecordId,
      false,
    );

    expect(result.isOrganizer).toBe(false);
  });
});
