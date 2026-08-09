import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import { users, trips, members, memberTravel } from "@/db/schema/index.js";
import { eq, or, and } from "drizzle-orm";
import { MemberTravelService } from "@/services/member-travel.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { generateUniquePhone } from "../test-utils.js";
import {
  MemberTravelNotFoundError,
  MemberNotFoundError,
  PermissionDeniedError,
  TripNotFoundError,
} from "@/errors.js";

// Create service instances with db for testing
const permissionsService = new PermissionsService(db);
const memberTravelService = new MemberTravelService(db, permissionsService);

describe("member-travel.service", () => {
  // Use unique test data for each test run to enable parallel execution
  let testOrganizerPhone: string;
  let testMember1Phone: string;
  let testMember2Phone: string;
  let testNonMemberPhone: string;

  let testOrganizerId: string;
  let testMember1Id: string;
  let testMember2Id: string;
  let testNonMemberId: string;

  let testTripId: string;
  let testMember1MemberId: string;
  let testMember2MemberId: string;
  let testMemberTravelId: string;

  // Clean up test data (safe for parallel execution)
  const cleanup = async () => {
    // Delete in reverse order of foreign key dependencies
    if (testTripId) {
      await db.delete(memberTravel).where(eq(memberTravel.tripId, testTripId));
      await db.delete(members).where(eq(members.tripId, testTripId));
      await db.delete(trips).where(eq(trips.id, testTripId));
    }

    const phoneNumbers = [
      testOrganizerPhone,
      testMember1Phone,
      testMember2Phone,
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
    testMember1Phone = generateUniquePhone();
    testMember2Phone = generateUniquePhone();
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

    const member1Result = await db
      .insert(users)
      .values({
        phoneNumber: testMember1Phone,
        displayName: "Test Member 1",
        timezone: "UTC",
      })
      .returning();
    testMember1Id = member1Result[0].id;

    const member2Result = await db
      .insert(users)
      .values({
        phoneNumber: testMember2Phone,
        displayName: "Test Member 2",
        timezone: "UTC",
      })
      .returning();
    testMember2Id = member2Result[0].id;

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

    // Add organizer as member with status='going'
    await db.insert(members).values({
      tripId: testTripId,
      userId: testOrganizerId,
      status: "going",
    });

    // Add member 1 with status='going'
    const member1MemberResult = await db
      .insert(members)
      .values({
        tripId: testTripId,
        userId: testMember1Id,
        status: "going",
      })
      .returning();
    testMember1MemberId = member1MemberResult[0].id;

    // Add member 2 with status='maybe'
    const member2MemberResult = await db
      .insert(members)
      .values({
        tripId: testTripId,
        userId: testMember2Id,
        status: "maybe",
      })
      .returning();
    testMember2MemberId = member2MemberResult[0].id;

    // Create a test member travel for member 1
    const travelResult = await db
      .insert(memberTravel)
      .values({
        tripId: testTripId,
        memberId: testMember1MemberId,
        travelType: "arrival",
        time: new Date("2026-06-10T14:00:00Z"),
        location: "Airport",
        details: "Flight AA123",
      })
      .returning();
    testMemberTravelId = travelResult[0].id;
  });

  afterEach(cleanup);

  describe("createMemberTravel", () => {
    it("should create member travel as member", async () => {
      const travelData = {
        travelType: "departure" as const,
        time: "2026-06-20T16:00:00Z",
        location: "Train Station",
        details: "Train to NYC",
      };

      const travel = await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        travelData,
      );

      expect(travel).toBeDefined();
      expect(travel.travelType).toBe(travelData.travelType);
      expect(travel.time).toEqual(new Date(travelData.time));
      expect(travel.location).toBe(travelData.location);
      expect(travel.details).toBe(travelData.details);
      expect(travel.memberId).toBe(testMember1MemberId);
      expect(travel.tripId).toBe(testTripId);
    });

    it("should create member travel for member with any status", async () => {
      const travelData = {
        travelType: "arrival" as const,
        time: "2026-06-11T10:00:00Z",
        location: "Bus Station",
      };

      const travel = await memberTravelService.createMemberTravel(
        testMember2Id,
        testTripId,
        travelData,
      );

      expect(travel).toBeDefined();
      expect(travel.memberId).toBe(testMember2MemberId);
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      const travelData = {
        travelType: "arrival" as const,
        time: "2026-06-12T12:00:00Z",
      };

      await expect(
        memberTravelService.createMemberTravel(
          testNonMemberId,
          testTripId,
          travelData,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw TripNotFoundError for non-existent trip", async () => {
      const travelData = {
        travelType: "arrival" as const,
        time: "2026-06-12T12:00:00Z",
      };

      await expect(
        memberTravelService.createMemberTravel(
          testMember1Id,
          "00000000-0000-0000-0000-000000000000",
          travelData,
        ),
      ).rejects.toThrow(TripNotFoundError);
    });

    it("should create member travel without optional fields", async () => {
      const travelData = {
        travelType: "departure" as const,
        time: "2026-06-21T08:00:00Z",
      };

      const travel = await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        travelData,
      );

      expect(travel).toBeDefined();
      expect(travel.location).toBeNull();
      expect(travel.details).toBeNull();
    });
  });

  describe("getMemberTravel", () => {
    it("should get member travel by ID", async () => {
      const travel =
        await memberTravelService.getMemberTravel(testMemberTravelId);

      expect(travel).toBeDefined();
      expect(travel?.id).toBe(testMemberTravelId);
      expect(travel?.travelType).toBe("arrival");
      expect(travel?.location).toBe("Airport");
    });

    it("should return null for non-existent member travel", async () => {
      const travel = await memberTravelService.getMemberTravel(
        "00000000-0000-0000-0000-000000000000",
      );

      expect(travel).toBeNull();
    });

    it("should return null for soft-deleted member travel", async () => {
      // Soft delete the member travel
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      const travel =
        await memberTravelService.getMemberTravel(testMemberTravelId);

      expect(travel).toBeNull();
    });
  });

  describe("getMemberTravelByTrip", () => {
    it("should get all member travel records for a trip", async () => {
      const travelList =
        await memberTravelService.getMemberTravelByTrip(testTripId);

      expect(travelList).toHaveLength(1);
      expect(travelList[0].id).toBe(testMemberTravelId);
    });

    it("should exclude soft-deleted records by default", async () => {
      // Soft delete the member travel
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      const travelList =
        await memberTravelService.getMemberTravelByTrip(testTripId);

      expect(travelList).toHaveLength(0);
    });

    it("should include soft-deleted records when includeDeleted=true", async () => {
      // Soft delete the member travel
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      const travelList = await memberTravelService.getMemberTravelByTrip(
        testTripId,
        true,
      );

      expect(travelList).toHaveLength(1);
      expect(travelList[0].deletedAt).not.toBeNull();
    });

    it("should return empty array for trip with no member travel", async () => {
      // Create another trip
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Empty Trip",
          destination: "Nowhere",
          preferredTimezone: "UTC",
          createdBy: testOrganizerId,
        })
        .returning();

      const travelList = await memberTravelService.getMemberTravelByTrip(
        tripResult[0].id,
      );

      expect(travelList).toEqual([]);

      // Cleanup
      await db.delete(trips).where(eq(trips.id, tripResult[0].id));
    });
  });

  describe("updateMemberTravel", () => {
    it("should update member travel as owner", async () => {
      const updateData = {
        location: "Updated Airport",
        details: "Updated Flight AA456",
      };

      const updatedTravel = await memberTravelService.updateMemberTravel(
        testMember1Id,
        testMemberTravelId,
        updateData,
      );

      expect(updatedTravel.location).toBe(updateData.location);
      expect(updatedTravel.details).toBe(updateData.details);
      expect(updatedTravel.travelType).toBe("arrival"); // Unchanged
    });

    it("should update member travel as organizer (not owner)", async () => {
      const updateData = {
        details: "Updated by organizer",
      };

      const updatedTravel = await memberTravelService.updateMemberTravel(
        testOrganizerId,
        testMemberTravelId,
        updateData,
      );

      expect(updatedTravel.details).toBe(updateData.details);
    });

    it("should throw PermissionDeniedError for different member", async () => {
      const updateData = {
        location: "Unauthorized Update",
      };

      await expect(
        memberTravelService.updateMemberTravel(
          testMember2Id,
          testMemberTravelId,
          updateData,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      const updateData = {
        location: "Unauthorized Update",
      };

      await expect(
        memberTravelService.updateMemberTravel(
          testNonMemberId,
          testMemberTravelId,
          updateData,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw MemberTravelNotFoundError for non-existent record", async () => {
      const updateData = {
        location: "Updated",
      };

      await expect(
        memberTravelService.updateMemberTravel(
          testMember1Id,
          "00000000-0000-0000-0000-000000000000",
          updateData,
        ),
      ).rejects.toThrow(MemberTravelNotFoundError);
    });

    it("should allow partial updates", async () => {
      const updateData = {
        travelType: "departure" as const,
      };

      const updatedTravel = await memberTravelService.updateMemberTravel(
        testMember1Id,
        testMemberTravelId,
        updateData,
      );

      expect(updatedTravel.travelType).toBe("departure");
      expect(updatedTravel.location).toBe("Airport"); // Unchanged
    });

    it("should update time field correctly", async () => {
      const updateData = {
        time: "2026-06-10T16:00:00Z",
      };

      const updatedTravel = await memberTravelService.updateMemberTravel(
        testMember1Id,
        testMemberTravelId,
        updateData,
      );

      expect(updatedTravel.time).toEqual(new Date(updateData.time));
    });
  });

  describe("deleteMemberTravel", () => {
    it("should soft delete member travel as owner", async () => {
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      const travel =
        await memberTravelService.getMemberTravel(testMemberTravelId);
      expect(travel).toBeNull();

      // Verify soft delete (check directly in DB)
      const [deletedTravel] = await db
        .select()
        .from(memberTravel)
        .where(eq(memberTravel.id, testMemberTravelId));

      expect(deletedTravel.deletedAt).not.toBeNull();
      expect(deletedTravel.deletedBy).toBe(testMember1Id);
    });

    it("should soft delete member travel as organizer", async () => {
      await memberTravelService.deleteMemberTravel(
        testOrganizerId,
        testMemberTravelId,
      );

      const travel =
        await memberTravelService.getMemberTravel(testMemberTravelId);
      expect(travel).toBeNull();

      // Verify deletedBy is the organizer
      const [deletedTravel] = await db
        .select()
        .from(memberTravel)
        .where(eq(memberTravel.id, testMemberTravelId));

      expect(deletedTravel.deletedBy).toBe(testOrganizerId);
    });

    it("should throw PermissionDeniedError for different member", async () => {
      await expect(
        memberTravelService.deleteMemberTravel(
          testMember2Id,
          testMemberTravelId,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      await expect(
        memberTravelService.deleteMemberTravel(
          testNonMemberId,
          testMemberTravelId,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw MemberTravelNotFoundError for non-existent record", async () => {
      await expect(
        memberTravelService.deleteMemberTravel(
          testMember1Id,
          "00000000-0000-0000-0000-000000000000",
        ),
      ).rejects.toThrow(MemberTravelNotFoundError);
    });
  });

  describe("restoreMemberTravel", () => {
    it("should restore soft-deleted member travel as organizer", async () => {
      // Soft delete the member travel
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      // Verify it's deleted
      let travel =
        await memberTravelService.getMemberTravel(testMemberTravelId);
      expect(travel).toBeNull();

      // Restore as organizer
      const restoredTravel = await memberTravelService.restoreMemberTravel(
        testOrganizerId,
        testMemberTravelId,
      );

      expect(restoredTravel.id).toBe(testMemberTravelId);
      expect(restoredTravel.deletedAt).toBeNull();
      expect(restoredTravel.deletedBy).toBeNull();

      // Verify it's visible again
      travel = await memberTravelService.getMemberTravel(testMemberTravelId);
      expect(travel).not.toBeNull();
    });

    it("should throw PermissionDeniedError for non-organizer member", async () => {
      // Soft delete the member travel
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      // Try to restore as member (not organizer)
      await expect(
        memberTravelService.restoreMemberTravel(
          testMember2Id,
          testMemberTravelId,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      // Soft delete the member travel
      await memberTravelService.deleteMemberTravel(
        testMember1Id,
        testMemberTravelId,
      );

      // Try to restore as non-member
      await expect(
        memberTravelService.restoreMemberTravel(
          testNonMemberId,
          testMemberTravelId,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw MemberTravelNotFoundError for non-existent record", async () => {
      await expect(
        memberTravelService.restoreMemberTravel(
          testOrganizerId,
          "00000000-0000-0000-0000-000000000000",
        ),
      ).rejects.toThrow(MemberTravelNotFoundError);
    });

    it("should allow owner to restore their own deleted travel (if they are organizer)", async () => {
      // Create member travel for organizer
      const [organizerMember] = await db
        .select()
        .from(members)
        .where(
          and(
            eq(members.tripId, testTripId),
            eq(members.userId, testOrganizerId),
          ),
        );

      const travelResult = await db
        .insert(memberTravel)
        .values({
          tripId: testTripId,
          memberId: organizerMember.id,
          travelType: "arrival",
          time: new Date("2026-06-15T10:00:00Z"),
        })
        .returning();

      const organizerTravelId = travelResult[0].id;

      // Delete and restore as organizer (who is also the owner)
      await memberTravelService.deleteMemberTravel(
        testOrganizerId,
        organizerTravelId,
      );
      const restoredTravel = await memberTravelService.restoreMemberTravel(
        testOrganizerId,
        organizerTravelId,
      );

      expect(restoredTravel.deletedAt).toBeNull();

      // Cleanup
      await db
        .delete(memberTravel)
        .where(eq(memberTravel.id, organizerTravelId));
    });
  });

  describe("edge cases", () => {
    it("should handle member travel with long details", async () => {
      const longDetails = "A".repeat(500);
      const travelData = {
        travelType: "departure" as const,
        time: "2026-06-22T18:00:00Z",
        details: longDetails,
      };

      const travel = await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        travelData,
      );

      expect(travel.details).toBe(longDetails);
    });

    it("should handle multiple member travel records for same member", async () => {
      // Create additional travel for member 1
      const travelData = {
        travelType: "departure" as const,
        time: "2026-06-25T20:00:00Z",
        location: "Airport",
      };

      const travel = await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        travelData,
      );

      expect(travel).toBeDefined();

      // Verify both records exist
      const travelList =
        await memberTravelService.getMemberTravelByTrip(testTripId);
      expect(travelList).toHaveLength(2);
    });

    it("should handle member travel for different members in same trip", async () => {
      // Create travel for member 2
      const travelData = {
        travelType: "arrival" as const,
        time: "2026-06-11T09:00:00Z",
      };

      const travel = await memberTravelService.createMemberTravel(
        testMember2Id,
        testTripId,
        travelData,
      );

      expect(travel.memberId).toBe(testMember2MemberId);

      // Verify both members' travel exists
      const travelList =
        await memberTravelService.getMemberTravelByTrip(testTripId);
      expect(travelList).toHaveLength(2);
      expect(travelList.map((t) => t.memberId)).toContain(testMember1MemberId);
      expect(travelList.map((t) => t.memberId)).toContain(testMember2MemberId);
    });
  });

  describe("member travel delegation", () => {
    it("should allow organizer to create travel for another member", async () => {
      const travelData = {
        travelType: "arrival" as const,
        time: "2026-06-10T14:00:00Z",
        location: "Airport",
        details: "Flight AA123",
        memberId: testMember1MemberId,
      };

      const travel = await memberTravelService.createMemberTravel(
        testOrganizerId,
        testTripId,
        travelData,
      );

      expect(travel).toBeDefined();
      expect(travel.memberId).toBe(testMember1MemberId);
      expect(travel.travelType).toBe("arrival");
      expect(travel.location).toBe("Airport");
      expect(travel.details).toBe("Flight AA123");
      expect(travel.tripId).toBe(testTripId);
    });

    it("should throw PermissionDeniedError when non-organizer creates travel for another member", async () => {
      const travelData = {
        travelType: "arrival" as const,
        time: "2026-06-10T14:00:00Z",
        location: "Airport",
        memberId: testMember2MemberId,
      };

      await expect(
        memberTravelService.createMemberTravel(
          testMember1Id,
          testTripId,
          travelData,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw MemberNotFoundError when memberId does not belong to trip", async () => {
      // Create a user and member in a different trip
      const otherTripPhone = generateUniquePhone();
      const [otherUser] = await db
        .insert(users)
        .values({
          phoneNumber: otherTripPhone,
          displayName: "Other Trip User",
          timezone: "UTC",
        })
        .returning();

      const [otherTrip] = await db
        .insert(trips)
        .values({
          name: "Other Trip",
          destination: "Other Destination",
          preferredTimezone: "UTC",
          createdBy: otherUser.id,
        })
        .returning();

      const [otherMember] = await db
        .insert(members)
        .values({
          tripId: otherTrip.id,
          userId: otherUser.id,
          status: "going",
        })
        .returning();

      const travelData = {
        travelType: "arrival" as const,
        time: "2026-06-10T14:00:00Z",
        memberId: otherMember.id,
      };

      await expect(
        memberTravelService.createMemberTravel(
          testOrganizerId,
          testTripId,
          travelData,
        ),
      ).rejects.toThrow(MemberNotFoundError);

      // Cleanup
      await db.delete(members).where(eq(members.tripId, otherTrip.id));
      await db.delete(trips).where(eq(trips.id, otherTrip.id));
      await db.delete(users).where(eq(users.phoneNumber, otherTripPhone));
    });

    it("should throw MemberNotFoundError when memberId is completely non-existent", async () => {
      const travelData = {
        travelType: "arrival" as const,
        time: "2026-06-10T14:00:00Z",
        memberId: "00000000-0000-0000-0000-000000000000",
      };

      await expect(
        memberTravelService.createMemberTravel(
          testOrganizerId,
          testTripId,
          travelData,
        ),
      ).rejects.toThrow(MemberNotFoundError);
    });

    it("should still create travel for self without memberId (backward compatibility)", async () => {
      const travelData = {
        travelType: "departure" as const,
        time: "2026-06-20T16:00:00Z",
        location: "Train Station",
      };

      const travel = await memberTravelService.createMemberTravel(
        testMember1Id,
        testTripId,
        travelData,
      );

      expect(travel).toBeDefined();
      expect(travel.memberId).toBe(testMember1MemberId);
      expect(travel.travelType).toBe("departure");
    });
  });
});
