import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  events,
  accommodations,
  memberTravel,
} from "@/db/schema/index.js";
import { eq, or } from "drizzle-orm";
import { PermissionsService } from "@/services/permissions.service.js";
import { generateUniquePhone } from "../test-utils.js";

// Create service instance with db for testing
const permissionsService = new PermissionsService(db);

describe("permissions.service", () => {
  // Use unique test data for each test run to enable parallel execution
  let testCreatorPhone: string;
  let testCoOrganizerPhone: string;
  let testMemberPhone: string;
  let testNonMemberPhone: string;

  let testCreatorId: string;
  let testCoOrganizerId: string;
  let testMemberId: string;
  let testNonMemberId: string;

  let testTripId: string;
  let testEventId: string;
  let testAccommodationId: string;
  let testMemberTravelId: string;
  let _testCreatorMemberId: string;
  let testCoOrganizerMemberId: string;
  let _testMemberMemberId: string;

  // Clean up test data (safe for parallel execution)
  const cleanup = async () => {
    // Delete in reverse order of foreign key dependencies
    if (testTripId) {
      // memberTravel references members, so delete it first
      await db.delete(memberTravel).where(eq(memberTravel.tripId, testTripId));
      await db.delete(events).where(eq(events.tripId, testTripId));
      await db
        .delete(accommodations)
        .where(eq(accommodations.tripId, testTripId));
      await db.delete(members).where(eq(members.tripId, testTripId));
      await db.delete(trips).where(eq(trips.id, testTripId));
    }

    const phoneNumbers = [
      testCreatorPhone,
      testCoOrganizerPhone,
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
    testCreatorPhone = generateUniquePhone();
    testCoOrganizerPhone = generateUniquePhone();
    testMemberPhone = generateUniquePhone();
    testNonMemberPhone = generateUniquePhone();

    // Clean up any existing data
    await cleanup();

    // Create test users
    const creatorResult = await db
      .insert(users)
      .values({
        phoneNumber: testCreatorPhone,
        displayName: "Test Creator",
        timezone: "UTC",
      })
      .returning();
    testCreatorId = creatorResult[0].id;

    const coOrganizerResult = await db
      .insert(users)
      .values({
        phoneNumber: testCoOrganizerPhone,
        displayName: "Test Co-Organizer",
        timezone: "UTC",
      })
      .returning();
    testCoOrganizerId = coOrganizerResult[0].id;

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
        createdBy: testCreatorId,
      })
      .returning();
    testTripId = tripResult[0].id;

    // Add creator as member with isOrganizer=true
    const creatorMemberResult = await db
      .insert(members)
      .values({
        tripId: testTripId,
        userId: testCreatorId,
        status: "going",
        isOrganizer: true,
      })
      .returning();
    _testCreatorMemberId = creatorMemberResult[0].id;

    // Add co-organizer as member with status='going' and isOrganizer=true
    const coOrganizerMemberResult = await db
      .insert(members)
      .values({
        tripId: testTripId,
        userId: testCoOrganizerId,
        status: "going",
        isOrganizer: true,
      })
      .returning();
    testCoOrganizerMemberId = coOrganizerMemberResult[0].id;

    // Add regular member with status='maybe'
    const memberMemberResult = await db
      .insert(members)
      .values({
        tripId: testTripId,
        userId: testMemberId,
        status: "maybe",
      })
      .returning();
    _testMemberMemberId = memberMemberResult[0].id;

    // Create a test event (created by co-organizer)
    const eventResult = await db
      .insert(events)
      .values({
        tripId: testTripId,
        createdBy: testCoOrganizerId,
        name: "Test Event",
        eventType: "activity",
        startTime: new Date("2026-06-15T10:00:00Z"),
      })
      .returning();
    testEventId = eventResult[0].id;

    // Create a test accommodation (created by creator)
    const accommodationResult = await db
      .insert(accommodations)
      .values({
        tripId: testTripId,
        createdBy: testCreatorId,
        name: "Test Hotel",
        checkIn: new Date("2026-06-10T14:00:00.000Z"),
        checkOut: new Date("2026-06-20T11:00:00.000Z"),
      })
      .returning();
    testAccommodationId = accommodationResult[0].id;

    // Create a test member travel (for co-organizer)
    const memberTravelResult = await db
      .insert(memberTravel)
      .values({
        tripId: testTripId,
        memberId: testCoOrganizerMemberId,
        travelType: "arrival",
        time: new Date("2026-06-10T14:00:00Z"),
        location: "Airport",
      })
      .returning();
    testMemberTravelId = memberTravelResult[0].id;
  });

  afterEach(cleanup);

  describe("isOrganizer", () => {
    it("should return true for trip creator", async () => {
      const result = await permissionsService.isOrganizer(
        testCreatorId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return true for co-organizer (member with isOrganizer=true)", async () => {
      const result = await permissionsService.isOrganizer(
        testCoOrganizerId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return false for regular member (isOrganizer=false)", async () => {
      const result = await permissionsService.isOrganizer(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.isOrganizer(
        testNonMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-existent trip", async () => {
      const result = await permissionsService.isOrganizer(
        testCreatorId,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(result).toBe(false);
    });

    it("should return false for non-existent user", async () => {
      const result = await permissionsService.isOrganizer(
        "00000000-0000-0000-0000-000000000000",
        testTripId,
      );
      expect(result).toBe(false);
    });
  });

  describe("isMember", () => {
    it("should return true for co-organizer (who is also a member)", async () => {
      const result = await permissionsService.isMember(
        testCoOrganizerId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return true for regular member", async () => {
      const result = await permissionsService.isMember(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.isMember(
        testNonMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return true for trip creator who is also a member", async () => {
      // Creator has a member record with isOrganizer=true from setup
      const result = await permissionsService.isMember(
        testCreatorId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return false for non-existent trip", async () => {
      const result = await permissionsService.isMember(
        testMemberId,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(result).toBe(false);
    });

    it("should return false for non-existent user", async () => {
      const result = await permissionsService.isMember(
        "00000000-0000-0000-0000-000000000000",
        testTripId,
      );
      expect(result).toBe(false);
    });
  });

  describe("canEditTrip", () => {
    it("should return true for trip creator", async () => {
      const result = await permissionsService.canEditTrip(
        testCreatorId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return true for co-organizer", async () => {
      const result = await permissionsService.canEditTrip(
        testCoOrganizerId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return false for regular member", async () => {
      const result = await permissionsService.canEditTrip(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canEditTrip(
        testNonMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });
  });

  describe("canDeleteTrip", () => {
    it("should return true for trip creator", async () => {
      const result = await permissionsService.canDeleteTrip(
        testCreatorId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return true for co-organizer", async () => {
      const result = await permissionsService.canDeleteTrip(
        testCoOrganizerId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return false for regular member", async () => {
      const result = await permissionsService.canDeleteTrip(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canDeleteTrip(
        testNonMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });
  });

  describe("canManageCoOrganizers", () => {
    it("should return true for trip creator", async () => {
      const result = await permissionsService.canManageCoOrganizers(
        testCreatorId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return true for co-organizer", async () => {
      const result = await permissionsService.canManageCoOrganizers(
        testCoOrganizerId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return false for regular member", async () => {
      const result = await permissionsService.canManageCoOrganizers(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canManageCoOrganizers(
        testNonMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle member isOrganizer changes correctly", async () => {
      // testMemberId was created with isOrganizer: false
      // Make them an organizer
      await db
        .update(members)
        .set({ isOrganizer: true })
        .where(eq(members.userId, testMemberId));

      let result = await permissionsService.isOrganizer(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(true);

      // Remove organizer status
      await db
        .update(members)
        .set({ isOrganizer: false })
        .where(eq(members.userId, testMemberId));

      result = await permissionsService.isOrganizer(testMemberId, testTripId);
      expect(result).toBe(false);
    });

    it("should handle creator also being a member", async () => {
      // Creator already has a member record with isOrganizer=true from setup
      // Should be an organizer (via both creator status and isOrganizer=true)
      const isOrganizerResult = await permissionsService.isOrganizer(
        testCreatorId,
        testTripId,
      );
      expect(isOrganizerResult).toBe(true);

      // Should also be a member
      const isMemberResult = await permissionsService.isMember(
        testCreatorId,
        testTripId,
      );
      expect(isMemberResult).toBe(true);
    });

    it("should handle multiple co-organizers", async () => {
      // Create another user and make them a co-organizer
      const anotherPhone = generateUniquePhone();
      const anotherUserResult = await db
        .insert(users)
        .values({
          phoneNumber: anotherPhone,
          displayName: "Another Co-Organizer",
          timezone: "UTC",
        })
        .returning();
      const anotherUserId = anotherUserResult[0].id;

      await db.insert(members).values({
        tripId: testTripId,
        userId: anotherUserId,
        status: "going",
        isOrganizer: true,
      });

      const result = await permissionsService.isOrganizer(
        anotherUserId,
        testTripId,
      );
      expect(result).toBe(true);

      // Clean up
      await db.delete(members).where(eq(members.userId, anotherUserId));
      await db.delete(users).where(eq(users.id, anotherUserId));
    });
  });

  describe("canAddEvent", () => {
    it("should return true for trip creator", async () => {
      const result = await permissionsService.canAddEvent(
        testCreatorId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return true for co-organizer (member with isOrganizer=true)", async () => {
      const result = await permissionsService.canAddEvent(
        testCoOrganizerId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return false for regular member (status=maybe) even if allowMembersToAddEvents is true", async () => {
      const result = await permissionsService.canAddEvent(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canAddEvent(
        testNonMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return false for member with status=going but isOrganizer=false when allowMembersToAddEvents is false", async () => {
      // Update member status to 'going' but they are NOT an organizer
      await db
        .update(members)
        .set({ status: "going" })
        .where(eq(members.userId, testMemberId));

      // Disable allowMembersToAddEvents
      await db
        .update(trips)
        .set({ allowMembersToAddEvents: false })
        .where(eq(trips.id, testTripId));

      // Regular members (isOrganizer=false) cannot add events when allowMembersToAddEvents is false
      const result = await permissionsService.canAddEvent(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(false);

      // Restore settings
      await db
        .update(trips)
        .set({ allowMembersToAddEvents: true })
        .where(eq(trips.id, testTripId));
      await db
        .update(members)
        .set({ status: "maybe" })
        .where(eq(members.userId, testMemberId));
    });

    it("should return true for member with status=going when allowMembersToAddEvents is true", async () => {
      // Update member status to 'going'
      await db
        .update(members)
        .set({ status: "going" })
        .where(eq(members.userId, testMemberId));

      const result = await permissionsService.canAddEvent(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(true);

      // Restore settings
      await db
        .update(members)
        .set({ status: "maybe" })
        .where(eq(members.userId, testMemberId));
    });

    it("should return true for co-organizer even when allowMembersToAddEvents is false", async () => {
      // Disable member event adding
      await db
        .update(trips)
        .set({ allowMembersToAddEvents: false })
        .where(eq(trips.id, testTripId));

      // Co-organizer (member with isOrganizer=true) should still be able to add events
      const result = await permissionsService.canAddEvent(
        testCoOrganizerId,
        testTripId,
      );
      expect(result).toBe(true);

      // Restore settings
      await db
        .update(trips)
        .set({ allowMembersToAddEvents: true })
        .where(eq(trips.id, testTripId));
    });

    it("should return false for non-existent trip", async () => {
      const result = await permissionsService.canAddEvent(
        testCreatorId,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(result).toBe(false);
    });
  });

  describe("canEditEvent", () => {
    it("should return true for event creator", async () => {
      const result = await permissionsService.canEditEvent(
        testCoOrganizerId,
        testEventId,
      );
      expect(result).toBe(true);
    });

    it("should return true for trip organizer (even if not event creator)", async () => {
      const result = await permissionsService.canEditEvent(
        testCreatorId,
        testEventId,
      );
      expect(result).toBe(true);
    });

    it("should return false for regular member", async () => {
      const result = await permissionsService.canEditEvent(
        testMemberId,
        testEventId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canEditEvent(
        testNonMemberId,
        testEventId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-existent event", async () => {
      const result = await permissionsService.canEditEvent(
        testCreatorId,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(result).toBe(false);
    });
  });

  describe("canDeleteEvent", () => {
    it("should return true for event creator", async () => {
      const result = await permissionsService.canDeleteEvent(
        testCoOrganizerId,
        testEventId,
      );
      expect(result).toBe(true);
    });

    it("should return true for trip organizer", async () => {
      const result = await permissionsService.canDeleteEvent(
        testCreatorId,
        testEventId,
      );
      expect(result).toBe(true);
    });

    it("should return false for regular member", async () => {
      const result = await permissionsService.canDeleteEvent(
        testMemberId,
        testEventId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canDeleteEvent(
        testNonMemberId,
        testEventId,
      );
      expect(result).toBe(false);
    });
  });

  describe("canAddAccommodation", () => {
    it("should return true for trip creator", async () => {
      const result = await permissionsService.canAddAccommodation(
        testCreatorId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return true for co-organizer", async () => {
      const result = await permissionsService.canAddAccommodation(
        testCoOrganizerId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return false for regular member", async () => {
      const result = await permissionsService.canAddAccommodation(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canAddAccommodation(
        testNonMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });
  });

  describe("canEditAccommodation", () => {
    it("should return true for trip creator", async () => {
      const result = await permissionsService.canEditAccommodation(
        testCreatorId,
        testAccommodationId,
      );
      expect(result).toBe(true);
    });

    it("should return true for co-organizer", async () => {
      const result = await permissionsService.canEditAccommodation(
        testCoOrganizerId,
        testAccommodationId,
      );
      expect(result).toBe(true);
    });

    it("should return false for regular member", async () => {
      const result = await permissionsService.canEditAccommodation(
        testMemberId,
        testAccommodationId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canEditAccommodation(
        testNonMemberId,
        testAccommodationId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-existent accommodation", async () => {
      const result = await permissionsService.canEditAccommodation(
        testCreatorId,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(result).toBe(false);
    });
  });

  describe("canDeleteAccommodation", () => {
    it("should return true for trip creator", async () => {
      const result = await permissionsService.canDeleteAccommodation(
        testCreatorId,
        testAccommodationId,
      );
      expect(result).toBe(true);
    });

    it("should return true for co-organizer", async () => {
      const result = await permissionsService.canDeleteAccommodation(
        testCoOrganizerId,
        testAccommodationId,
      );
      expect(result).toBe(true);
    });

    it("should return false for regular member", async () => {
      const result = await permissionsService.canDeleteAccommodation(
        testMemberId,
        testAccommodationId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canDeleteAccommodation(
        testNonMemberId,
        testAccommodationId,
      );
      expect(result).toBe(false);
    });
  });

  describe("canAddMemberTravel", () => {
    it("should return true for co-organizer (who is a member)", async () => {
      const result = await permissionsService.canAddMemberTravel(
        testCoOrganizerId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return true for regular member", async () => {
      const result = await permissionsService.canAddMemberTravel(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canAddMemberTravel(
        testNonMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return true for trip creator who is also a member", async () => {
      // Creator has a member record from setup
      const result = await permissionsService.canAddMemberTravel(
        testCreatorId,
        testTripId,
      );
      expect(result).toBe(true);
    });
  });

  describe("canEditMemberTravel", () => {
    it("should return true for owner of member travel", async () => {
      const result = await permissionsService.canEditMemberTravel(
        testCoOrganizerId,
        testMemberTravelId,
      );
      expect(result).toBe(true);
    });

    it("should return true for trip creator (organizer)", async () => {
      const result = await permissionsService.canEditMemberTravel(
        testCreatorId,
        testMemberTravelId,
      );
      expect(result).toBe(true);
    });

    it("should return false for different member", async () => {
      const result = await permissionsService.canEditMemberTravel(
        testMemberId,
        testMemberTravelId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canEditMemberTravel(
        testNonMemberId,
        testMemberTravelId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-existent member travel", async () => {
      const result = await permissionsService.canEditMemberTravel(
        testCoOrganizerId,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(result).toBe(false);
    });
  });

  describe("canDeleteMemberTravel", () => {
    it("should return true for owner of member travel", async () => {
      const result = await permissionsService.canDeleteMemberTravel(
        testCoOrganizerId,
        testMemberTravelId,
      );
      expect(result).toBe(true);
    });

    it("should return true for trip creator (organizer)", async () => {
      const result = await permissionsService.canDeleteMemberTravel(
        testCreatorId,
        testMemberTravelId,
      );
      expect(result).toBe(true);
    });

    it("should return false for different member", async () => {
      const result = await permissionsService.canDeleteMemberTravel(
        testMemberId,
        testMemberTravelId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canDeleteMemberTravel(
        testNonMemberId,
        testMemberTravelId,
      );
      expect(result).toBe(false);
    });
  });

  describe("canInviteMembers", () => {
    it("should return true for organizer", async () => {
      const result = await permissionsService.canInviteMembers(
        testCreatorId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return true for co-organizer", async () => {
      const result = await permissionsService.canInviteMembers(
        testCoOrganizerId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return false for regular member", async () => {
      const result = await permissionsService.canInviteMembers(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canInviteMembers(
        testNonMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });
  });

  describe("canUpdateRsvp", () => {
    it("should return true for any member", async () => {
      const result = await permissionsService.canUpdateRsvp(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return true for organizer", async () => {
      const result = await permissionsService.canUpdateRsvp(
        testCreatorId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canUpdateRsvp(
        testNonMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });
  });

  describe("canViewFullTrip", () => {
    it("should return true for member with status going", async () => {
      const result = await permissionsService.canViewFullTrip(
        testCreatorId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return false for member with status maybe", async () => {
      // testMemberId has status='maybe' from setup
      const result = await permissionsService.canViewFullTrip(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canViewFullTrip(
        testNonMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return false for member with status not_going", async () => {
      // Update member status to 'not_going'
      await db
        .update(members)
        .set({ status: "not_going" })
        .where(eq(members.userId, testMemberId));

      const result = await permissionsService.canViewFullTrip(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(false);

      // Restore status
      await db
        .update(members)
        .set({ status: "maybe" })
        .where(eq(members.userId, testMemberId));
    });
  });

  describe("canEditEvent - status restrictions", () => {
    let memberEventId: string;

    beforeEach(async () => {
      // Update regular member status to 'going' so they can create events
      await db
        .update(members)
        .set({ status: "going" })
        .where(eq(members.userId, testMemberId));

      // Create an event by the regular member (non-organizer)
      const eventResult = await db
        .insert(events)
        .values({
          tripId: testTripId,
          createdBy: testMemberId,
          name: "Member Event",
          eventType: "activity",
          startTime: new Date("2026-06-16T10:00:00Z"),
        })
        .returning();
      memberEventId = eventResult[0].id;
    });

    it("should return false for event creator with status=maybe", async () => {
      // Change creator's member status to 'maybe'
      await db
        .update(members)
        .set({ status: "maybe" })
        .where(eq(members.userId, testMemberId));

      const result = await permissionsService.canEditEvent(
        testMemberId,
        memberEventId,
      );
      expect(result).toBe(false);

      // Restore status
      await db
        .update(members)
        .set({ status: "going" })
        .where(eq(members.userId, testMemberId));
    });

    it("should return true for event creator with status=going", async () => {
      const result = await permissionsService.canEditEvent(
        testMemberId,
        memberEventId,
      );
      expect(result).toBe(true);
    });

    it("should return true for organizer even if not event creator", async () => {
      // Organizer can edit any event regardless
      const result = await permissionsService.canEditEvent(
        testCreatorId,
        memberEventId,
      );
      expect(result).toBe(true);
    });

    it("should return false for event creator with status=not_going", async () => {
      // Change creator's member status to 'not_going'
      await db
        .update(members)
        .set({ status: "not_going" })
        .where(eq(members.userId, testMemberId));

      const result = await permissionsService.canEditEvent(
        testMemberId,
        memberEventId,
      );
      expect(result).toBe(false);

      // Restore status
      await db
        .update(members)
        .set({ status: "going" })
        .where(eq(members.userId, testMemberId));
    });
  });

  describe("isTripLocked", () => {
    it("should return true for trip with past end date", async () => {
      // Set trip end date to a past date
      await db
        .update(trips)
        .set({ endDate: "2025-01-05" })
        .where(eq(trips.id, testTripId));

      const result = await permissionsService.isTripLocked(testTripId);
      expect(result).toBe(true);

      // Restore
      await db
        .update(trips)
        .set({ endDate: null })
        .where(eq(trips.id, testTripId));
    });

    it("should return false for trip with future end date", async () => {
      // Set trip end date to a future date
      await db
        .update(trips)
        .set({ endDate: "2099-12-31" })
        .where(eq(trips.id, testTripId));

      const result = await permissionsService.isTripLocked(testTripId);
      expect(result).toBe(false);

      // Restore
      await db
        .update(trips)
        .set({ endDate: null })
        .where(eq(trips.id, testTripId));
    });

    it("should return false for trip with null end date", async () => {
      // endDate is already null from setup
      const result = await permissionsService.isTripLocked(testTripId);
      expect(result).toBe(false);
    });

    it("should return false for non-existent trip", async () => {
      const result = await permissionsService.isTripLocked(
        "00000000-0000-0000-0000-000000000000",
      );
      expect(result).toBe(false);
    });
  });

  describe("getMembershipInfo", () => {
    it("should return isMember=true and isOrganizer=true for organizer", async () => {
      const result = await permissionsService.getMembershipInfo(
        testCreatorId,
        testTripId,
      );
      expect(result).toEqual({ isMember: true, isOrganizer: true });
    });

    it("should return isMember=true and isOrganizer=false for regular member", async () => {
      const result = await permissionsService.getMembershipInfo(
        testMemberId,
        testTripId,
      );
      expect(result).toEqual({ isMember: true, isOrganizer: false });
    });

    it("should return isMember=false and isOrganizer=false for non-member", async () => {
      const result = await permissionsService.getMembershipInfo(
        testNonMemberId,
        testTripId,
      );
      expect(result).toEqual({ isMember: false, isOrganizer: false });
    });
  });

  describe("canEditEventWithData", () => {
    it("should return true for organizer editing any event", async () => {
      const result = await permissionsService.canEditEventWithData(
        testCreatorId,
        { tripId: testTripId, createdBy: testCoOrganizerId },
      );
      expect(result).toBe(true);
    });

    it("should return true for member editing own event", async () => {
      // Member needs status='going' to edit their own event
      await db
        .update(members)
        .set({ status: "going" })
        .where(eq(members.userId, testMemberId));

      const result = await permissionsService.canEditEventWithData(
        testMemberId,
        { tripId: testTripId, createdBy: testMemberId },
      );
      expect(result).toBe(true);

      // Restore status
      await db
        .update(members)
        .set({ status: "maybe" })
        .where(eq(members.userId, testMemberId));
    });

    it("should return false for member editing another member's event", async () => {
      await db
        .update(members)
        .set({ status: "going" })
        .where(eq(members.userId, testMemberId));

      const result = await permissionsService.canEditEventWithData(
        testMemberId,
        { tripId: testTripId, createdBy: testCoOrganizerId },
      );
      expect(result).toBe(false);

      await db
        .update(members)
        .set({ status: "maybe" })
        .where(eq(members.userId, testMemberId));
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canEditEventWithData(
        testNonMemberId,
        { tripId: testTripId, createdBy: testCoOrganizerId },
      );
      expect(result).toBe(false);
    });
  });

  describe("canDeleteEventWithData", () => {
    it("should return true for organizer deleting any event", async () => {
      const result = await permissionsService.canDeleteEventWithData(
        testCreatorId,
        { tripId: testTripId, createdBy: testCoOrganizerId },
      );
      expect(result).toBe(true);
    });

    it("should return true for member deleting own event", async () => {
      await db
        .update(members)
        .set({ status: "going" })
        .where(eq(members.userId, testMemberId));

      const result = await permissionsService.canDeleteEventWithData(
        testMemberId,
        { tripId: testTripId, createdBy: testMemberId },
      );
      expect(result).toBe(true);

      await db
        .update(members)
        .set({ status: "maybe" })
        .where(eq(members.userId, testMemberId));
    });

    it("should return false for member deleting another member's event", async () => {
      await db
        .update(members)
        .set({ status: "going" })
        .where(eq(members.userId, testMemberId));

      const result = await permissionsService.canDeleteEventWithData(
        testMemberId,
        { tripId: testTripId, createdBy: testCoOrganizerId },
      );
      expect(result).toBe(false);

      await db
        .update(members)
        .set({ status: "maybe" })
        .where(eq(members.userId, testMemberId));
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canDeleteEventWithData(
        testNonMemberId,
        { tripId: testTripId, createdBy: testCoOrganizerId },
      );
      expect(result).toBe(false);
    });
  });

  describe("canEditAccommodationWithData", () => {
    it("should return true for organizer", async () => {
      const result = await permissionsService.canEditAccommodationWithData(
        testCreatorId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return false for non-organizer member", async () => {
      const result = await permissionsService.canEditAccommodationWithData(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canEditAccommodationWithData(
        testNonMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });
  });

  describe("canDeleteAccommodationWithData", () => {
    it("should return true for organizer", async () => {
      const result = await permissionsService.canDeleteAccommodationWithData(
        testCreatorId,
        testTripId,
      );
      expect(result).toBe(true);
    });

    it("should return false for non-organizer member", async () => {
      const result = await permissionsService.canDeleteAccommodationWithData(
        testMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canDeleteAccommodationWithData(
        testNonMemberId,
        testTripId,
      );
      expect(result).toBe(false);
    });
  });

  describe("canEditMemberTravelWithData", () => {
    it("should return true for organizer editing any member's travel", async () => {
      const result = await permissionsService.canEditMemberTravelWithData(
        testCreatorId,
        { tripId: testTripId, memberId: testCoOrganizerMemberId },
      );
      expect(result).toBe(true);
    });

    it("should return true for member editing own travel", async () => {
      const result = await permissionsService.canEditMemberTravelWithData(
        testCoOrganizerId,
        { tripId: testTripId, memberId: testCoOrganizerMemberId },
      );
      expect(result).toBe(true);
    });

    it("should return false for member editing another member's travel", async () => {
      const result = await permissionsService.canEditMemberTravelWithData(
        testMemberId,
        { tripId: testTripId, memberId: testCoOrganizerMemberId },
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canEditMemberTravelWithData(
        testNonMemberId,
        { tripId: testTripId, memberId: testCoOrganizerMemberId },
      );
      expect(result).toBe(false);
    });
  });

  describe("canDeleteMemberTravelWithData", () => {
    it("should return true for organizer deleting any member's travel", async () => {
      const result = await permissionsService.canDeleteMemberTravelWithData(
        testCreatorId,
        { tripId: testTripId, memberId: testCoOrganizerMemberId },
      );
      expect(result).toBe(true);
    });

    it("should return true for member deleting own travel", async () => {
      const result = await permissionsService.canDeleteMemberTravelWithData(
        testCoOrganizerId,
        { tripId: testTripId, memberId: testCoOrganizerMemberId },
      );
      expect(result).toBe(true);
    });

    it("should return false for member deleting another member's travel", async () => {
      const result = await permissionsService.canDeleteMemberTravelWithData(
        testMemberId,
        { tripId: testTripId, memberId: testCoOrganizerMemberId },
      );
      expect(result).toBe(false);
    });

    it("should return false for non-member", async () => {
      const result = await permissionsService.canDeleteMemberTravelWithData(
        testNonMemberId,
        { tripId: testTripId, memberId: testCoOrganizerMemberId },
      );
      expect(result).toBe(false);
    });
  });
});
