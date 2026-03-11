import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/config/database.js";
import {
  trips,
  members,
  users,
  events,
  weatherCache,
  type User,
} from "@/db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { TripService, type TripSummary } from "@/services/trip.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import type { IGeocodingService } from "@/services/geocoding.service.js";
import { generateUniquePhone } from "../test-utils.js";
import type { CreateTripInput } from "@tripful/shared/schemas";

// Create mock geocoding service
const mockGeocodingService: IGeocodingService = {
  geocode: vi.fn().mockResolvedValue({ lat: 32.7157, lon: -117.1611 }),
};

// Create service instances with db for testing
const permissionsService = new PermissionsService(db);
const tripService = new TripService(
  db,
  permissionsService,
  mockGeocodingService,
);

describe("trip.service", () => {
  // Use unique phone numbers per test run to enable parallel execution
  let testUserId: string;
  let testPhone: string;
  let coOrganizerUserId: string;
  let coOrganizerPhone: string;
  let coOrganizer2UserId: string;
  let coOrganizer2Phone: string;

  // Clean up only this test file's data (safe for parallel execution)
  const cleanup = async () => {
    // Delete in reverse order of FK dependencies
    if (testUserId) {
      // Delete events created by this user before trips
      await db.delete(events).where(eq(events.createdBy, testUserId));
      await db.delete(members).where(eq(members.userId, testUserId));
      await db.delete(trips).where(eq(trips.createdBy, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
    if (coOrganizerUserId) {
      await db.delete(events).where(eq(events.createdBy, coOrganizerUserId));
      await db.delete(members).where(eq(members.userId, coOrganizerUserId));
      await db.delete(trips).where(eq(trips.createdBy, coOrganizerUserId));
      await db.delete(users).where(eq(users.id, coOrganizerUserId));
    }
    if (coOrganizer2UserId) {
      await db.delete(events).where(eq(events.createdBy, coOrganizer2UserId));
      await db.delete(members).where(eq(members.userId, coOrganizer2UserId));
      await db.delete(trips).where(eq(trips.createdBy, coOrganizer2UserId));
      await db.delete(users).where(eq(users.id, coOrganizer2UserId));
    }
  };

  beforeEach(async () => {
    testPhone = generateUniquePhone();
    coOrganizerPhone = generateUniquePhone();
    coOrganizer2Phone = generateUniquePhone();
    await cleanup();

    // Setup test user (creator)
    const [testUser] = await db
      .insert(users)
      .values({
        phoneNumber: testPhone,
        displayName: "Test User",
        timezone: "UTC",
      })
      .returning();
    testUserId = testUser.id;

    // Setup co-organizer user
    const [coOrganizerUser] = await db
      .insert(users)
      .values({
        phoneNumber: coOrganizerPhone,
        displayName: "Co-Organizer",
        timezone: "UTC",
      })
      .returning();
    coOrganizerUserId = coOrganizerUser.id;

    // Setup second co-organizer user
    const [coOrganizer2User] = await db
      .insert(users)
      .values({
        phoneNumber: coOrganizer2Phone,
        displayName: "Co-Organizer 2",
        timezone: "UTC",
      })
      .returning();
    coOrganizer2UserId = coOrganizer2User.id;
  });

  afterEach(cleanup);

  describe("createTrip", () => {
    it("should create trip record with correct data", async () => {
      const tripData: CreateTripInput = {
        name: "Beach Vacation",
        destination: "Hawaii",
        startDate: "2026-06-01",
        endDate: "2026-06-10",
        timezone: "Pacific/Honolulu",
        description: "Summer beach trip",
        coverImageUrl: "https://example.com/beach.jpg",
        allowMembersToAddEvents: true,
      };

      const trip = await tripService.createTrip(testUserId, tripData);

      // Verify trip was created with correct data
      expect(trip).toBeDefined();
      expect(trip.id).toBeDefined();
      expect(trip.name).toBe("Beach Vacation");
      expect(trip.destination).toBe("Hawaii");
      expect(trip.startDate).toBe("2026-06-01");
      expect(trip.endDate).toBe("2026-06-10");
      expect(trip.preferredTimezone).toBe("Pacific/Honolulu"); // Note: timezone -> preferredTimezone
      expect(trip.description).toBe("Summer beach trip");
      expect(trip.coverImageUrl).toBe("https://example.com/beach.jpg");
      expect(trip.allowMembersToAddEvents).toBe(true);
      expect(trip.cancelled).toBe(false);
      expect(trip.createdBy).toBe(testUserId);
      expect(trip.createdAt).toBeInstanceOf(Date);
      expect(trip.updatedAt).toBeInstanceOf(Date);

      // Verify trip exists in database
      const dbTrip = await db
        .select()
        .from(trips)
        .where(eq(trips.id, trip.id))
        .limit(1);
      expect(dbTrip).toHaveLength(1);
      expect(dbTrip[0].name).toBe("Beach Vacation");
    });

    it('should automatically add creator as member with status="going" and isOrganizer=true', async () => {
      const tripData: CreateTripInput = {
        name: "City Tour",
        destination: "New York",
        timezone: "America/New_York",
        allowMembersToAddEvents: true,
      };

      const trip = await tripService.createTrip(testUserId, tripData);

      // Verify creator is added as member with status='going' and isOrganizer=true
      const memberRecords = await db
        .select()
        .from(members)
        .where(eq(members.tripId, trip.id));

      expect(memberRecords).toHaveLength(1);
      expect(memberRecords[0].userId).toBe(testUserId);
      expect(memberRecords[0].status).toBe("going");
      expect(memberRecords[0].isOrganizer).toBe(true);
      expect(memberRecords[0].tripId).toBe(trip.id);
      expect(memberRecords[0].createdAt).toBeInstanceOf(Date);
      expect(memberRecords[0].updatedAt).toBeInstanceOf(Date);
    });

    it("should add co-organizers as members with isOrganizer=true when provided", async () => {
      const tripData: CreateTripInput = {
        name: "Group Adventure",
        destination: "Mountains",
        timezone: "America/Denver",
        allowMembersToAddEvents: true,
        coOrganizerPhones: [coOrganizerPhone, coOrganizer2Phone],
      };

      const trip = await tripService.createTrip(testUserId, tripData);

      // Verify all members are added: creator + 2 co-organizers
      const memberRecords = await db
        .select()
        .from(members)
        .where(eq(members.tripId, trip.id));

      expect(memberRecords).toHaveLength(3);

      // Verify creator is a member with isOrganizer=true
      const creatorMember = memberRecords.find((m) => m.userId === testUserId);
      expect(creatorMember).toBeDefined();
      expect(creatorMember!.status).toBe("going");
      expect(creatorMember!.isOrganizer).toBe(true);

      // Verify co-organizer 1 is a member with isOrganizer=true
      const coOrganizerMember = memberRecords.find(
        (m) => m.userId === coOrganizerUserId,
      );
      expect(coOrganizerMember).toBeDefined();
      expect(coOrganizerMember!.status).toBe("going");
      expect(coOrganizerMember!.isOrganizer).toBe(true);

      // Verify co-organizer 2 is a member with isOrganizer=true
      const coOrganizer2Member = memberRecords.find(
        (m) => m.userId === coOrganizer2UserId,
      );
      expect(coOrganizer2Member).toBeDefined();
      expect(coOrganizer2Member!.status).toBe("going");
      expect(coOrganizer2Member!.isOrganizer).toBe(true);
    });

    it("should return trip object with all fields populated", async () => {
      const tripData: CreateTripInput = {
        name: "Weekend Getaway",
        destination: "Lake Tahoe",
        startDate: "2026-07-15",
        endDate: "2026-07-17",
        timezone: "America/Los_Angeles",
        description: "Quick weekend trip",
        coverImageUrl: null, // Test null value
        allowMembersToAddEvents: false,
      };

      const trip = await tripService.createTrip(testUserId, tripData);

      // Verify all fields are present
      expect(trip).toMatchObject({
        name: "Weekend Getaway",
        destination: "Lake Tahoe",
        startDate: "2026-07-15",
        endDate: "2026-07-17",
        preferredTimezone: "America/Los_Angeles",
        description: "Quick weekend trip",
        coverImageUrl: null,
        allowMembersToAddEvents: false,
        cancelled: false,
        createdBy: testUserId,
      });

      // Verify UUID and timestamps are present
      expect(trip.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(trip.createdAt).toBeInstanceOf(Date);
      expect(trip.updatedAt).toBeInstanceOf(Date);
    });

    it("should throw error when co-organizer phone not found", async () => {
      const nonExistentPhone = generateUniquePhone();
      const tripData: CreateTripInput = {
        name: "Failed Trip",
        destination: "Nowhere",
        timezone: "UTC",
        allowMembersToAddEvents: true,
        coOrganizerPhones: [nonExistentPhone],
      };

      await expect(
        tripService.createTrip(testUserId, tripData),
      ).rejects.toThrow(`Co-organizer not found: ${nonExistentPhone}`);

      // Verify no trip was created
      const allTrips = await db
        .select()
        .from(trips)
        .where(eq(trips.createdBy, testUserId));
      expect(allTrips).toHaveLength(0);
    });

    it("should throw error when member limit exceeded (>25)", async () => {
      // Create 25 co-organizers (creator + 25 = 26, which exceeds limit)
      const coOrganizerPhones: string[] = [];
      for (let i = 0; i < 25; i++) {
        const phone = generateUniquePhone();
        await db.insert(users).values({
          phoneNumber: phone,
          displayName: `Co-Organizer ${i}`,
          timezone: "UTC",
        });
        coOrganizerPhones.push(phone);
      }

      const tripData: CreateTripInput = {
        name: "Too Many Members",
        destination: "Somewhere",
        timezone: "UTC",
        allowMembersToAddEvents: true,
        coOrganizerPhones,
      };

      await expect(
        tripService.createTrip(testUserId, tripData),
      ).rejects.toThrow(
        "Member limit exceeded: maximum 25 members allowed (including creator)",
      );

      // Verify no trip was created
      const allTrips = await db
        .select()
        .from(trips)
        .where(eq(trips.createdBy, testUserId));
      expect(allTrips).toHaveLength(0);

      // Cleanup the 25 test users
      for (const phone of coOrganizerPhones) {
        await db.delete(users).where(eq(users.phoneNumber, phone));
      }
    });

    it("should handle optional fields correctly", async () => {
      const tripData: CreateTripInput = {
        name: "Minimal Trip",
        destination: "Somewhere",
        timezone: "UTC",
        allowMembersToAddEvents: true,
        // No startDate, endDate, description, coverImageUrl
      };

      const trip = await tripService.createTrip(testUserId, tripData);

      expect(trip.name).toBe("Minimal Trip");
      expect(trip.destination).toBe("Somewhere");
      expect(trip.startDate).toBeNull();
      expect(trip.endDate).toBeNull();
      expect(trip.description).toBeNull();
      expect(trip.coverImageUrl).toBeNull();
      expect(trip.preferredTimezone).toBe("UTC");
      expect(trip.allowMembersToAddEvents).toBe(true);
    });
  });

  describe("getMemberCount", () => {
    it("should return 0 for trip with no members", async () => {
      // Create a trip (which adds creator as member)
      const tripData: CreateTripInput = {
        name: "Test Trip",
        destination: "Test Destination",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };

      const trip = await tripService.createTrip(testUserId, tripData);

      // Delete all members from the trip
      await db.delete(members).where(eq(members.tripId, trip.id));

      // Verify count is 0
      const count = await tripService.getMemberCount(trip.id);
      expect(count).toBe(0);
    });

    it("should return 1 for trip with only creator", async () => {
      const tripData: CreateTripInput = {
        name: "Solo Trip",
        destination: "Solo Destination",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };

      const trip = await tripService.createTrip(testUserId, tripData);

      // Verify count is 1 (creator only)
      const count = await tripService.getMemberCount(trip.id);
      expect(count).toBe(1);
    });

    it("should return correct count for trip with creator and co-organizers", async () => {
      const tripData: CreateTripInput = {
        name: "Group Trip",
        destination: "Group Destination",
        timezone: "UTC",
        allowMembersToAddEvents: true,
        coOrganizerPhones: [coOrganizerPhone, coOrganizer2Phone],
      };

      const trip = await tripService.createTrip(testUserId, tripData);

      // Verify count is 3 (creator + 2 co-organizers)
      const count = await tripService.getMemberCount(trip.id);
      expect(count).toBe(3);
    });

    it("should count all members regardless of status", async () => {
      const tripData: CreateTripInput = {
        name: "Status Test Trip",
        destination: "Status Test",
        timezone: "UTC",
        allowMembersToAddEvents: true,
        coOrganizerPhones: [coOrganizerPhone],
      };

      const trip = await tripService.createTrip(testUserId, tripData);

      // Update co-organizer status to 'maybe'
      await db
        .update(members)
        .set({ status: "maybe" })
        .where(eq(members.userId, coOrganizerUserId));

      // Verify count is still 2 (status doesn't matter)
      const count = await tripService.getMemberCount(trip.id);
      expect(count).toBe(2);
    });
  });

  describe("getTripById", () => {
    it("should return full trip details when user is a member", async () => {
      // Create a trip with co-organizers
      const tripData: CreateTripInput = {
        name: "Tokyo Adventure",
        destination: "Tokyo, Japan",
        startDate: "2026-09-01",
        endDate: "2026-09-10",
        timezone: "Asia/Tokyo",
        description: "Exploring Tokyo together",
        coverImageUrl: "https://example.com/tokyo.jpg",
        allowMembersToAddEvents: true,
        coOrganizerPhones: [coOrganizerPhone],
      };

      const trip = await tripService.createTrip(testUserId, tripData);

      // Get trip as the creator (who is a member)
      const result = await tripService.getTripById(trip.id, testUserId);

      // Verify trip is returned with all details
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.id).toBe(trip.id);
      expect(result!.name).toBe("Tokyo Adventure");
      expect(result!.destination).toBe("Tokyo, Japan");
      expect(result!.startDate).toBe("2026-09-01");
      expect(result!.endDate).toBe("2026-09-10");
      expect(result!.preferredTimezone).toBe("Asia/Tokyo");
      expect(result!.description).toBe("Exploring Tokyo together");
      expect(result!.coverImageUrl).toBe("https://example.com/tokyo.jpg");
      expect(result!.allowMembersToAddEvents).toBe(true);
      expect(result!.cancelled).toBe(false);
      expect(result!.createdBy).toBe(testUserId);
    });

    it("should return null when trip does not exist", async () => {
      const nonExistentTripId = "00000000-0000-0000-0000-000000000000";

      const result = await tripService.getTripById(
        nonExistentTripId,
        testUserId,
      );

      expect(result).toBeNull();
    });

    it("should return null when user is not a member", async () => {
      // Create a trip with testUser as creator
      const tripData: CreateTripInput = {
        name: "Private Trip",
        destination: "Secret Location",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };

      const trip = await tripService.createTrip(testUserId, tripData);

      // Try to access as coOrganizer (who is not a member)
      const result = await tripService.getTripById(trip.id, coOrganizerUserId);

      // Should return null for non-members (security best practice)
      expect(result).toBeNull();
    });

    it("should include organizer information", async () => {
      // Create a trip with co-organizers
      const tripData: CreateTripInput = {
        name: "Team Trip",
        destination: "Conference Center",
        timezone: "America/New_York",
        allowMembersToAddEvents: true,
        coOrganizerPhones: [coOrganizerPhone, coOrganizer2Phone],
      };

      const trip = await tripService.createTrip(testUserId, tripData);

      // Get trip as a member
      const result = await tripService.getTripById(trip.id, testUserId);

      // Verify organizer information is included
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result).toHaveProperty("organizers");
      expect(Array.isArray(result!.organizers)).toBe(true);
      expect(result!.organizers).toHaveLength(3); // creator + 2 co-organizers

      // Verify creator is in organizers list
      const creator = result!.organizers.find((org) => org.id === testUserId);
      expect(creator).toBeDefined();
      expect(creator!.displayName).toBe("Test User");
      expect(creator!.phoneNumber).toBe(testPhone);

      // Verify co-organizers are in the list
      const coOrg1 = result!.organizers.find(
        (org) => org.id === coOrganizerUserId,
      );
      expect(coOrg1).toBeDefined();
      expect(coOrg1!.displayName).toBe("Co-Organizer");

      const coOrg2 = result!.organizers.find(
        (org) => org.id === coOrganizer2UserId,
      );
      expect(coOrg2).toBeDefined();
      expect(coOrg2!.displayName).toBe("Co-Organizer 2");
    });

    it("should include member count", async () => {
      // Create a trip with co-organizers
      const tripData: CreateTripInput = {
        name: "Group Vacation",
        destination: "Beach Resort",
        timezone: "Pacific/Honolulu",
        allowMembersToAddEvents: true,
        coOrganizerPhones: [coOrganizerPhone, coOrganizer2Phone],
      };

      const trip = await tripService.createTrip(testUserId, tripData);

      // Get trip as a member
      const result = await tripService.getTripById(trip.id, testUserId);

      // Verify member count is included
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result).toHaveProperty("memberCount");
      expect(result!.memberCount).toBe(3); // creator + 2 co-organizers
    });

    it("should allow co-organizer to access trip", async () => {
      // Create a trip with co-organizer
      const tripData: CreateTripInput = {
        name: "Shared Trip",
        destination: "Shared Destination",
        timezone: "UTC",
        allowMembersToAddEvents: true,
        coOrganizerPhones: [coOrganizerPhone],
      };

      const trip = await tripService.createTrip(testUserId, tripData);

      // Get trip as the co-organizer (who is a member)
      const result = await tripService.getTripById(trip.id, coOrganizerUserId);

      // Verify co-organizer can access the trip
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.id).toBe(trip.id);
      expect(result!.name).toBe("Shared Trip");
    });
  });

  describe("getUserTrips", () => {
    it("should return all trips where user is a member", async () => {
      // Create multiple trips where testUser is a member
      const trip1Data: CreateTripInput = {
        name: "Trip 1",
        destination: "Destination 1",
        startDate: "2026-08-01",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };
      const trip1 = await tripService.createTrip(testUserId, trip1Data);

      const trip2Data: CreateTripInput = {
        name: "Trip 2",
        destination: "Destination 2",
        startDate: "2026-09-01",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };
      const trip2 = await tripService.createTrip(testUserId, trip2Data);

      // Create a trip where coOrganizer is creator (testUser is co-organizer)
      const trip3Data: CreateTripInput = {
        name: "Trip 3",
        destination: "Destination 3",
        startDate: "2026-07-01",
        timezone: "UTC",
        allowMembersToAddEvents: true,
        coOrganizerPhones: [testPhone],
      };
      const trip3 = await tripService.createTrip(coOrganizerUserId, trip3Data);

      // Get all trips for testUser
      const results = await tripService.getUserTrips(testUserId);

      // Verify all 3 trips are returned
      expect(results.data).toHaveLength(3);
      expect(results.meta.total).toBe(3);
      const tripIds = results.data.map((t: TripSummary) => t.id);
      expect(tripIds).toContain(trip1.id);
      expect(tripIds).toContain(trip2.id);
      expect(tripIds).toContain(trip3.id);
    });

    it("should return empty result when user has no trips", async () => {
      // Don't create any trips for testUser
      const results = await tripService.getUserTrips(testUserId);

      expect(results.data).toHaveLength(0);
      expect(Array.isArray(results.data)).toBe(true);
      expect(results.meta.total).toBe(0);
      expect(results.meta.hasMore).toBe(false);
      expect(results.meta.nextCursor).toBeNull();
    });

    it("should return trip summary with all required fields", async () => {
      // Create a trip with full details
      const tripData: CreateTripInput = {
        name: "Complete Trip",
        destination: "Full Destination",
        startDate: "2026-10-15",
        endDate: "2026-10-20",
        timezone: "America/New_York",
        description: "A complete trip",
        coverImageUrl: "https://example.com/cover.jpg",
        allowMembersToAddEvents: true,
        coOrganizerPhones: [coOrganizerPhone],
      };
      await tripService.createTrip(testUserId, tripData);

      // Get user trips
      const results = await tripService.getUserTrips(testUserId);

      expect(results.data).toHaveLength(1);
      expect(results.meta).toBeDefined();
      const summary = results.data[0];

      // Verify all required fields are present
      expect(summary).toHaveProperty("id");
      expect(summary).toHaveProperty("name", "Complete Trip");
      expect(summary).toHaveProperty("destination", "Full Destination");
      expect(summary).toHaveProperty("startDate", "2026-10-15");
      expect(summary).toHaveProperty("endDate", "2026-10-20");
      expect(summary).toHaveProperty(
        "coverImageUrl",
        "https://example.com/cover.jpg",
      );
      expect(summary).toHaveProperty("isOrganizer");
      expect(summary).toHaveProperty("rsvpStatus");
      expect(summary).toHaveProperty("organizerInfo");
      expect(summary).toHaveProperty("memberCount", 2);
      expect(summary).toHaveProperty("eventCount", 0);

      // Verify organizerInfo structure
      expect(Array.isArray(summary.organizerInfo)).toBe(true);
      expect(summary.organizerInfo).toHaveLength(2);
      expect(summary.organizerInfo[0]).toHaveProperty("id");
      expect(summary.organizerInfo[0]).toHaveProperty("displayName");
      expect(summary.organizerInfo[0]).toHaveProperty("profilePhotoUrl");
    });

    it("should set isOrganizer=true for trip creator", async () => {
      // Create a trip where testUser is creator
      const tripData: CreateTripInput = {
        name: "Creator Trip",
        destination: "Creator Destination",
        startDate: "2026-11-01",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };
      await tripService.createTrip(testUserId, tripData);

      // Get user trips
      const results = await tripService.getUserTrips(testUserId);

      expect(results.data).toHaveLength(1);
      expect(results.data[0].isOrganizer).toBe(true);
    });

    it("should set isOrganizer=true for co-organizer with isOrganizer column", async () => {
      // Create a trip where testUser is co-organizer (isOrganizer=true set automatically)
      const tripData: CreateTripInput = {
        name: "Co-Org Trip",
        destination: "Co-Org Destination",
        startDate: "2026-11-15",
        timezone: "UTC",
        allowMembersToAddEvents: true,
        coOrganizerPhones: [testPhone],
      };
      await tripService.createTrip(coOrganizerUserId, tripData);

      // Get user trips
      const results = await tripService.getUserTrips(testUserId);

      expect(results.data).toHaveLength(1);
      expect(results.data[0].isOrganizer).toBe(true);
      expect(results.data[0].rsvpStatus).toBe("going");
    });

    it("should set isOrganizer=false for regular member with isOrganizer=false", async () => {
      // Create a trip where testUser is creator
      const tripData: CreateTripInput = {
        name: "Regular Member Trip",
        destination: "Regular Destination",
        startDate: "2026-12-01",
        timezone: "UTC",
        allowMembersToAddEvents: true,
        coOrganizerPhones: [coOrganizerPhone],
      };
      const trip = await tripService.createTrip(testUserId, tripData);

      // Add coOrganizer2 as regular member with status='maybe'
      await db.insert(members).values({
        tripId: trip.id,
        userId: coOrganizer2UserId,
        status: "maybe",
      });

      // Get trips for coOrganizer2
      const results = await tripService.getUserTrips(coOrganizer2UserId);

      expect(results.data).toHaveLength(1);
      expect(results.data[0].isOrganizer).toBe(false);
      expect(results.data[0].rsvpStatus).toBe("maybe");
    });

    it("should return trips ordered by startDate (upcoming first)", async () => {
      // Create trips with different start dates
      const futureTrip: CreateTripInput = {
        name: "Future Trip",
        destination: "Future",
        startDate: "2027-01-01",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };
      await tripService.createTrip(testUserId, futureTrip);

      const soonTrip: CreateTripInput = {
        name: "Soon Trip",
        destination: "Soon",
        startDate: "2026-06-01",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };
      await tripService.createTrip(testUserId, soonTrip);

      const midTrip: CreateTripInput = {
        name: "Mid Trip",
        destination: "Mid",
        startDate: "2026-09-01",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };
      await tripService.createTrip(testUserId, midTrip);

      // Get trips
      const results = await tripService.getUserTrips(testUserId);

      // Verify ordering: soonTrip, midTrip, futureTrip
      expect(results.data).toHaveLength(3);
      expect(results.data[0].name).toBe("Soon Trip");
      expect(results.data[1].name).toBe("Mid Trip");
      expect(results.data[2].name).toBe("Future Trip");
    });

    it("should place trips with null startDate at the end", async () => {
      // Create trips with and without start dates
      const datedTrip: CreateTripInput = {
        name: "Dated Trip",
        destination: "Dated",
        startDate: "2026-08-01",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };
      await tripService.createTrip(testUserId, datedTrip);

      const undatedTrip: CreateTripInput = {
        name: "Undated Trip",
        destination: "Undated",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };
      await tripService.createTrip(testUserId, undatedTrip);

      // Get trips
      const results = await tripService.getUserTrips(testUserId);

      // Verify ordering: dated trip first, undated trip last
      expect(results.data).toHaveLength(2);
      expect(results.data[0].name).toBe("Dated Trip");
      expect(results.data[1].name).toBe("Undated Trip");
      expect(results.data[1].startDate).toBeNull();
    });

    it("should return correct rsvpStatus from members table", async () => {
      // Create trip where testUser is creator (status='going')
      const tripData: CreateTripInput = {
        name: "RSVP Test Trip",
        destination: "RSVP Test",
        startDate: "2026-11-01",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };
      const trip = await tripService.createTrip(testUserId, tripData);

      // Add coOrganizer with different status
      await db.insert(members).values({
        tripId: trip.id,
        userId: coOrganizerUserId,
        status: "maybe",
      });

      // Get trips for testUser (should have status='going')
      const testUserResults = await tripService.getUserTrips(testUserId);
      expect(testUserResults.data).toHaveLength(1);
      expect(testUserResults.data[0].rsvpStatus).toBe("going");

      // Get trips for coOrganizer (should have status='maybe')
      const coOrgResults = await tripService.getUserTrips(coOrganizerUserId);
      expect(coOrgResults.data).toHaveLength(1);
      expect(coOrgResults.data[0].rsvpStatus).toBe("maybe");
    });

    it("should return correct eventCount when trip has events", async () => {
      // Create a trip
      const tripData: CreateTripInput = {
        name: "Event Count Trip",
        destination: "Test Destination",
        startDate: "2026-08-01",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };
      const trip = await tripService.createTrip(testUserId, tripData);

      // Insert events for the trip
      await db.insert(events).values([
        {
          tripId: trip.id,
          createdBy: testUserId,
          name: "Event 1",
          eventType: "activity",
          startTime: new Date("2026-08-01T10:00:00Z"),
        },
        {
          tripId: trip.id,
          createdBy: testUserId,
          name: "Event 2",
          eventType: "meal",
          startTime: new Date("2026-08-01T12:00:00Z"),
        },
        {
          tripId: trip.id,
          createdBy: testUserId,
          name: "Event 3",
          eventType: "travel",
          startTime: new Date("2026-08-01T14:00:00Z"),
        },
      ]);

      // Get user trips
      const results = await tripService.getUserTrips(testUserId);

      expect(results.data).toHaveLength(1);
      expect(results.data[0].eventCount).toBe(3);
    });

    it("should exclude soft-deleted events from eventCount", async () => {
      // Create a trip
      const tripData: CreateTripInput = {
        name: "Soft Delete Event Trip",
        destination: "Test Destination",
        startDate: "2026-09-01",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };
      const trip = await tripService.createTrip(testUserId, tripData);

      // Insert active events
      await db.insert(events).values([
        {
          tripId: trip.id,
          createdBy: testUserId,
          name: "Active Event 1",
          eventType: "activity",
          startTime: new Date("2026-09-01T10:00:00Z"),
        },
        {
          tripId: trip.id,
          createdBy: testUserId,
          name: "Active Event 2",
          eventType: "meal",
          startTime: new Date("2026-09-01T12:00:00Z"),
        },
      ]);

      // Insert soft-deleted events
      await db.insert(events).values([
        {
          tripId: trip.id,
          createdBy: testUserId,
          name: "Deleted Event 1",
          eventType: "activity",
          startTime: new Date("2026-09-01T14:00:00Z"),
          deletedAt: new Date("2026-09-02T00:00:00Z"),
          deletedBy: testUserId,
        },
        {
          tripId: trip.id,
          createdBy: testUserId,
          name: "Deleted Event 2",
          eventType: "travel",
          startTime: new Date("2026-09-01T16:00:00Z"),
          deletedAt: new Date("2026-09-02T00:00:00Z"),
          deletedBy: testUserId,
        },
      ]);

      // Get user trips - should only count active (non-deleted) events
      const results = await tripService.getUserTrips(testUserId);

      expect(results.data).toHaveLength(1);
      expect(results.data[0].eventCount).toBe(2);
    });
  });

  describe("updateTrip", () => {
    let testCreatorId: string;
    let testCoOrganizerId: string;
    let testNonOrganizerId: string;
    let testTripId: string;
    let testPhone1: string;
    let testPhone2: string;
    let testPhone3: string;

    beforeEach(async () => {
      // Setup test users
      testPhone1 = generateUniquePhone();
      testPhone2 = generateUniquePhone();
      testPhone3 = generateUniquePhone();

      // Create creator
      const [creator] = await db
        .insert(users)
        .values({
          phoneNumber: testPhone1,
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();
      testCreatorId = creator.id;

      // Create co-organizer
      const [coOrganizer] = await db
        .insert(users)
        .values({
          phoneNumber: testPhone2,
          displayName: "Co-Organizer",
          timezone: "UTC",
        })
        .returning();
      testCoOrganizerId = coOrganizer.id;

      // Create non-organizer
      const [nonOrganizer] = await db
        .insert(users)
        .values({
          phoneNumber: testPhone3,
          displayName: "Non-Organizer",
          timezone: "UTC",
        })
        .returning();
      testNonOrganizerId = nonOrganizer.id;

      // Create trip with creator
      const tripData: CreateTripInput = {
        name: "Test Trip",
        destination: "Test Destination",
        timezone: "America/New_York",
        startDate: "2026-06-01",
        endDate: "2026-06-07",
        allowMembersToAddEvents: false,
      };

      const trip = await tripService.createTrip(testCreatorId, tripData);
      testTripId = trip.id;

      // Add co-organizer manually (since addCoOrganizers is not implemented yet)
      await db.insert(members).values({
        tripId: testTripId,
        userId: testCoOrganizerId,
        status: "going",
        isOrganizer: true,
      });
    });

    afterEach(async () => {
      // Cleanup in reverse FK dependency order
      await db.delete(members).where(eq(members.tripId, testTripId));
      await db.delete(trips).where(eq(trips.id, testTripId));
      await db.delete(users).where(eq(users.id, testCreatorId));
      await db.delete(users).where(eq(users.id, testCoOrganizerId));
      await db.delete(users).where(eq(users.id, testNonOrganizerId));
    });

    it("should allow creator to update trip", async () => {
      const updateData = { name: "Updated Trip Name" };
      const result = await tripService.updateTrip(
        testTripId,
        testCreatorId,
        updateData,
      );

      expect(result.name).toBe("Updated Trip Name");
      expect(result.id).toBe(testTripId);
    });

    it("should allow co-organizer to update trip", async () => {
      const updateData = { destination: "New Destination" };
      const result = await tripService.updateTrip(
        testTripId,
        testCoOrganizerId,
        updateData,
      );

      expect(result.destination).toBe("New Destination");
      expect(result.id).toBe(testTripId);
    });

    it("should throw error when non-organizer tries to update", async () => {
      const updateData = { name: "Hacked" };
      await expect(
        tripService.updateTrip(testTripId, testNonOrganizerId, updateData),
      ).rejects.toThrow("Permission denied");
    });

    it("should only update provided fields", async () => {
      const originalTrip = await tripService.getTripById(
        testTripId,
        testCreatorId,
      );
      const updateData = { name: "New Name" };

      const result = await tripService.updateTrip(
        testTripId,
        testCreatorId,
        updateData,
      );

      expect(result.name).toBe("New Name");
      expect(result.destination).toBe(originalTrip!.destination);
      expect(result.preferredTimezone).toBe(originalTrip!.preferredTimezone);
    });

    it("should update the updatedAt timestamp", async () => {
      const originalTrip = await tripService.getTripById(
        testTripId,
        testCreatorId,
      );
      const originalUpdatedAt = originalTrip!.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await tripService.updateTrip(testTripId, testCreatorId, {
        name: "New",
      });

      expect(result.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime(),
      );
    });

    it("should throw error when trip does not exist", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      await expect(
        tripService.updateTrip(fakeId, testCreatorId, { name: "Test" }),
      ).rejects.toThrow("Trip not found");
    });

    it("should correctly map timezone field to preferredTimezone", async () => {
      const updateData = { timezone: "Europe/London" };
      const result = await tripService.updateTrip(
        testTripId,
        testCreatorId,
        updateData,
      );

      expect(result.preferredTimezone).toBe("Europe/London");
    });
  });

  describe("cancelTrip", () => {
    let testCreatorId: string;
    let testCoOrganizerId: string;
    let testNonOrganizerId: string;
    let testTripId: string;
    let testPhone1: string;
    let testPhone2: string;
    let testPhone3: string;

    beforeEach(async () => {
      // Generate unique phones
      testPhone1 = generateUniquePhone();
      testPhone2 = generateUniquePhone();
      testPhone3 = generateUniquePhone();

      // Create creator
      const [creator] = await db
        .insert(users)
        .values({
          phoneNumber: testPhone1,
          displayName: "Creator",
          timezone: "UTC",
        })
        .returning();
      testCreatorId = creator.id;

      // Create co-organizer
      const [coOrganizer] = await db
        .insert(users)
        .values({
          phoneNumber: testPhone2,
          displayName: "Co-Organizer",
          timezone: "UTC",
        })
        .returning();
      testCoOrganizerId = coOrganizer.id;

      // Create non-organizer
      const [nonOrganizer] = await db
        .insert(users)
        .values({
          phoneNumber: testPhone3,
          displayName: "Non-Organizer",
          timezone: "UTC",
        })
        .returning();
      testNonOrganizerId = nonOrganizer.id;

      // Create trip with creator
      const tripData: CreateTripInput = {
        name: "Test Trip",
        destination: "Test Destination",
        timezone: "America/New_York",
        startDate: "2026-06-01",
        endDate: "2026-06-07",
        allowMembersToAddEvents: false,
      };

      const trip = await tripService.createTrip(testCreatorId, tripData);
      testTripId = trip.id;

      // Add co-organizer as member with status='going' and isOrganizer=true
      await db.insert(members).values({
        tripId: testTripId,
        userId: testCoOrganizerId,
        status: "going",
        isOrganizer: true,
      });
    });

    afterEach(async () => {
      // Cleanup in reverse FK dependency order
      await db.delete(members).where(eq(members.tripId, testTripId));
      await db.delete(trips).where(eq(trips.id, testTripId));
      await db.delete(users).where(eq(users.id, testCreatorId));
      await db.delete(users).where(eq(users.id, testCoOrganizerId));
      await db.delete(users).where(eq(users.id, testNonOrganizerId));
    });

    it("should allow organizer (creator) to cancel trip successfully", async () => {
      await tripService.cancelTrip(testTripId, testCreatorId);

      // Verify trip is marked as cancelled
      const [dbTrip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, testTripId))
        .limit(1);

      expect(dbTrip).toBeDefined();
      expect(dbTrip.cancelled).toBe(true);
    });

    it("should allow co-organizer to cancel trip", async () => {
      await tripService.cancelTrip(testTripId, testCoOrganizerId);

      // Verify trip is marked as cancelled
      const [dbTrip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, testTripId))
        .limit(1);

      expect(dbTrip).toBeDefined();
      expect(dbTrip.cancelled).toBe(true);
    });

    it("should throw permission error when non-organizer tries to cancel", async () => {
      await expect(
        tripService.cancelTrip(testTripId, testNonOrganizerId),
      ).rejects.toThrow("Permission denied: only organizers can cancel trips");
    });

    it("should mark trip as cancelled in database (soft delete)", async () => {
      await tripService.cancelTrip(testTripId, testCreatorId);

      // Query database directly
      const dbTrip = await db
        .select()
        .from(trips)
        .where(eq(trips.id, testTripId))
        .limit(1);

      expect(dbTrip).toHaveLength(1);
      expect(dbTrip[0].cancelled).toBe(true);
    });

    it("should keep trip record in database (not hard deleted)", async () => {
      await tripService.cancelTrip(testTripId, testCreatorId);

      // Query trips table by ID
      const dbTrip = await db
        .select()
        .from(trips)
        .where(eq(trips.id, testTripId))
        .limit(1);

      // Record should still exist
      expect(dbTrip).toHaveLength(1);
      expect(dbTrip[0].id).toBe(testTripId);
      expect(dbTrip[0].cancelled).toBe(true);
    });

    it("should update updatedAt timestamp when cancelling", async () => {
      // Get original trip
      const [originalTrip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, testTripId))
        .limit(1);

      const originalUpdatedAt = originalTrip.updatedAt.getTime();

      // Wait to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await tripService.cancelTrip(testTripId, testCreatorId);

      // Verify updatedAt changed
      const [updatedTrip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, testTripId))
        .limit(1);

      expect(updatedTrip.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt,
      );
    });

    it("should throw error when trip does not exist", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      await expect(
        tripService.cancelTrip(fakeId, testCreatorId),
      ).rejects.toThrow("Trip not found");
    });
  });

  describe("Co-Organizer Management", () => {
    let testCreatorId: string;
    let testNonOrganizerId: string;
    let testTripId: string;
    let newCoOrgPhone1: string;
    let newCoOrgPhone2: string;
    let newCoOrgPhone3: string;
    let newCoOrgUserId1: string;
    let newCoOrgUserId2: string;
    let newCoOrgUserId3: string;

    beforeEach(async () => {
      // Generate unique phones
      const creatorPhone = generateUniquePhone();
      const nonOrganizerPhone = generateUniquePhone();
      newCoOrgPhone1 = generateUniquePhone();
      newCoOrgPhone2 = generateUniquePhone();
      newCoOrgPhone3 = generateUniquePhone();

      // Create creator
      const [creator] = await db
        .insert(users)
        .values({
          phoneNumber: creatorPhone,
          displayName: "Trip Creator",
          timezone: "UTC",
        })
        .returning();
      testCreatorId = creator.id;

      // Create non-organizer
      const [nonOrganizer] = await db
        .insert(users)
        .values({
          phoneNumber: nonOrganizerPhone,
          displayName: "Non-Organizer",
          timezone: "UTC",
        })
        .returning();
      testNonOrganizerId = nonOrganizer.id;

      // Create potential co-organizers
      const [coOrg1] = await db
        .insert(users)
        .values({
          phoneNumber: newCoOrgPhone1,
          displayName: "New Co-Org 1",
          timezone: "UTC",
        })
        .returning();
      newCoOrgUserId1 = coOrg1.id;

      const [coOrg2] = await db
        .insert(users)
        .values({
          phoneNumber: newCoOrgPhone2,
          displayName: "New Co-Org 2",
          timezone: "UTC",
        })
        .returning();
      newCoOrgUserId2 = coOrg2.id;

      const [coOrg3] = await db
        .insert(users)
        .values({
          phoneNumber: newCoOrgPhone3,
          displayName: "New Co-Org 3",
          timezone: "UTC",
        })
        .returning();
      newCoOrgUserId3 = coOrg3.id;

      // Create trip with creator
      const tripData: CreateTripInput = {
        name: "Co-Org Test Trip",
        destination: "Test Destination",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      };

      const trip = await tripService.createTrip(testCreatorId, tripData);
      testTripId = trip.id;
    });

    afterEach(async () => {
      // Cleanup in reverse FK dependency order
      await db.delete(members).where(eq(members.tripId, testTripId));
      await db.delete(trips).where(eq(trips.id, testTripId));
      await db.delete(users).where(eq(users.id, testCreatorId));
      await db.delete(users).where(eq(users.id, testNonOrganizerId));
      await db.delete(users).where(eq(users.id, newCoOrgUserId1));
      await db.delete(users).where(eq(users.id, newCoOrgUserId2));
      await db.delete(users).where(eq(users.id, newCoOrgUserId3));
    });

    describe("addCoOrganizers", () => {
      it("should allow organizer to add co-organizers successfully", async () => {
        await tripService.addCoOrganizers(testTripId, testCreatorId, [
          newCoOrgPhone1,
          newCoOrgPhone2,
        ]);

        // Verify co-organizers were added to members table
        const memberRecords = await db
          .select()
          .from(members)
          .where(eq(members.tripId, testTripId));

        // Should have creator + 2 new co-organizers = 3 members
        expect(memberRecords).toHaveLength(3);

        // Verify co-organizer 1 was added with isOrganizer=true
        const coOrg1Member = memberRecords.find(
          (m) => m.userId === newCoOrgUserId1,
        );
        expect(coOrg1Member).toBeDefined();
        expect(coOrg1Member!.status).toBe("going");
        expect(coOrg1Member!.isOrganizer).toBe(true);

        // Verify co-organizer 2 was added with isOrganizer=true
        const coOrg2Member = memberRecords.find(
          (m) => m.userId === newCoOrgUserId2,
        );
        expect(coOrg2Member).toBeDefined();
        expect(coOrg2Member!.status).toBe("going");
        expect(coOrg2Member!.isOrganizer).toBe(true);
      });

      it("should throw error when non-organizer tries to add co-organizers", async () => {
        await expect(
          tripService.addCoOrganizers(testTripId, testNonOrganizerId, [
            newCoOrgPhone1,
          ]),
        ).rejects.toThrow(
          "Permission denied: only organizers can manage co-organizers",
        );
      });

      it('should create member records with status="going" and isOrganizer=true', async () => {
        await tripService.addCoOrganizers(testTripId, testCreatorId, [
          newCoOrgPhone1,
        ]);

        // Verify member record was created with correct status and isOrganizer
        const [memberRecord] = await db
          .select()
          .from(members)
          .where(
            and(
              eq(members.tripId, testTripId),
              eq(members.userId, newCoOrgUserId1),
            ),
          );

        expect(memberRecord).toBeDefined();
        expect(memberRecord.status).toBe("going");
        expect(memberRecord.isOrganizer).toBe(true);
        expect(memberRecord.tripId).toBe(testTripId);
        expect(memberRecord.userId).toBe(newCoOrgUserId1);
      });

      it("should throw error when member limit exceeded (>25)", async () => {
        // Add 23 co-organizers to reach the limit (creator + 23 = 24)
        const existingCoOrgPhones: string[] = [];
        for (let i = 0; i < 23; i++) {
          const phone = generateUniquePhone();
          const [user] = await db
            .insert(users)
            .values({
              phoneNumber: phone,
              displayName: `Existing Co-Org ${i}`,
              timezone: "UTC",
            })
            .returning();

          await db.insert(members).values({
            tripId: testTripId,
            userId: user.id,
            status: "going",
          });
          existingCoOrgPhones.push(phone);
        }

        // Try to add 2 more (would make 26 total, exceeding limit of 25)
        await expect(
          tripService.addCoOrganizers(testTripId, testCreatorId, [
            newCoOrgPhone1,
            newCoOrgPhone2,
          ]),
        ).rejects.toThrow(
          "Member limit exceeded: maximum 25 members allowed (including creator)",
        );

        // Cleanup the 23 test users
        for (const phone of existingCoOrgPhones) {
          await db.delete(users).where(eq(users.phoneNumber, phone));
        }
      });

      it("should throw error when phone number not found", async () => {
        const nonExistentPhone = generateUniquePhone();

        await expect(
          tripService.addCoOrganizers(testTripId, testCreatorId, [
            nonExistentPhone,
          ]),
        ).rejects.toThrow(`Co-organizer not found: ${nonExistentPhone}`);

        // Verify no new members were added
        const memberRecords = await db
          .select()
          .from(members)
          .where(eq(members.tripId, testTripId));

        // Should only have the creator
        expect(memberRecords).toHaveLength(1);
      });

      it("should filter out users already members of the trip", async () => {
        // Add first co-organizer
        await tripService.addCoOrganizers(testTripId, testCreatorId, [
          newCoOrgPhone1,
        ]);

        // Try to add same co-organizer again plus a new one
        await tripService.addCoOrganizers(testTripId, testCreatorId, [
          newCoOrgPhone1,
          newCoOrgPhone2,
        ]);

        // Verify only 3 members exist (creator + coOrg1 + coOrg2)
        const memberRecords = await db
          .select()
          .from(members)
          .where(eq(members.tripId, testTripId));

        expect(memberRecords).toHaveLength(3);

        // Verify no duplicate members
        const userIds = memberRecords.map((m) => m.userId);
        const uniqueUserIds = new Set(userIds);
        expect(uniqueUserIds.size).toBe(3);
      });

      it("should throw error when trip does not exist", async () => {
        const fakeId = "00000000-0000-0000-0000-000000000000";
        await expect(
          tripService.addCoOrganizers(fakeId, testCreatorId, [newCoOrgPhone1]),
        ).rejects.toThrow("Trip not found");
      });
    });

    describe("removeCoOrganizer", () => {
      beforeEach(async () => {
        // Add a co-organizer to the trip
        await db.insert(members).values({
          tripId: testTripId,
          userId: newCoOrgUserId1,
          status: "going",
        });
      });

      it("should allow organizer to remove co-organizer successfully", async () => {
        await tripService.removeCoOrganizer(
          testTripId,
          testCreatorId,
          newCoOrgUserId1,
        );

        // Verify co-organizer was removed
        const memberRecords = await db
          .select()
          .from(members)
          .where(eq(members.tripId, testTripId));

        // Should only have creator now
        expect(memberRecords).toHaveLength(1);
        expect(memberRecords[0].userId).toBe(testCreatorId);
      });

      it("should throw error when non-organizer tries to remove co-organizer", async () => {
        await expect(
          tripService.removeCoOrganizer(
            testTripId,
            testNonOrganizerId,
            newCoOrgUserId1,
          ),
        ).rejects.toThrow(
          "Permission denied: only organizers can manage co-organizers",
        );
      });

      it("should throw error when trying to remove trip creator", async () => {
        await expect(
          tripService.removeCoOrganizer(
            testTripId,
            testCreatorId,
            testCreatorId,
          ),
        ).rejects.toThrow("Cannot remove trip creator as co-organizer");

        // Verify creator is still a member
        const creatorMember = await db
          .select()
          .from(members)
          .where(
            and(
              eq(members.tripId, testTripId),
              eq(members.userId, testCreatorId),
            ),
          );

        expect(creatorMember).toHaveLength(1);
      });

      it("should throw error when co-organizer not found in trip", async () => {
        // Try to remove user who is not a member
        await expect(
          tripService.removeCoOrganizer(
            testTripId,
            testCreatorId,
            newCoOrgUserId2,
          ),
        ).rejects.toThrow("Co-organizer not found in trip");
      });

      it("should throw error when trip does not exist", async () => {
        const fakeId = "00000000-0000-0000-0000-000000000000";
        await expect(
          tripService.removeCoOrganizer(fakeId, testCreatorId, newCoOrgUserId1),
        ).rejects.toThrow("Trip not found");
      });
    });

    describe("getCoOrganizers", () => {
      it("should return all co-organizers (members with isOrganizer=true)", async () => {
        // Add co-organizers with isOrganizer=true
        await db.insert(members).values([
          {
            tripId: testTripId,
            userId: newCoOrgUserId1,
            status: "going",
            isOrganizer: true,
          },
          {
            tripId: testTripId,
            userId: newCoOrgUserId2,
            status: "going",
            isOrganizer: true,
          },
        ]);

        const coOrganizers = await tripService.getCoOrganizers(testTripId);

        // Should return creator + 2 co-organizers = 3 users
        expect(coOrganizers).toHaveLength(3);

        // Verify all expected users are present
        const coOrgIds = coOrganizers.map((user: User) => user.id);
        expect(coOrgIds).toContain(testCreatorId);
        expect(coOrgIds).toContain(newCoOrgUserId1);
        expect(coOrgIds).toContain(newCoOrgUserId2);

        // Verify full user objects are returned
        const creator = coOrganizers.find((user) => user.id === testCreatorId);
        expect(creator).toHaveProperty("displayName", "Trip Creator");
        expect(creator).toHaveProperty("phoneNumber");
        expect(creator).toHaveProperty("timezone", "UTC");
      });

      it("should exclude members with isOrganizer=false", async () => {
        // Add co-organizer with isOrganizer=true
        await db.insert(members).values({
          tripId: testTripId,
          userId: newCoOrgUserId1,
          status: "going",
          isOrganizer: true,
        });

        // Add regular member with isOrganizer=false (default)
        await db.insert(members).values({
          tripId: testTripId,
          userId: newCoOrgUserId2,
          status: "maybe",
        });

        const coOrganizers = await tripService.getCoOrganizers(testTripId);

        // Should only return creator + co-organizer with isOrganizer=true = 2 users
        expect(coOrganizers).toHaveLength(2);

        const coOrgIds = coOrganizers.map((user: User) => user.id);
        expect(coOrgIds).toContain(testCreatorId);
        expect(coOrgIds).toContain(newCoOrgUserId1);
        expect(coOrgIds).not.toContain(newCoOrgUserId2);
      });

      it("should return only creator when no co-organizers added", async () => {
        const coOrganizers = await tripService.getCoOrganizers(testTripId);

        // Should only return creator
        expect(coOrganizers).toHaveLength(1);
        expect(coOrganizers[0].id).toBe(testCreatorId);
        expect(coOrganizers[0].displayName).toBe("Trip Creator");
      });

      it("should return empty array when trip does not exist", async () => {
        const fakeId = "00000000-0000-0000-0000-000000000000";
        const coOrganizers = await tripService.getCoOrganizers(fakeId);

        expect(coOrganizers).toHaveLength(0);
        expect(Array.isArray(coOrganizers)).toBe(true);
      });
    });
  });

  describe("geocoding on create/update", () => {
    let geoTestUserId: string;
    let geoTestTripId: string;
    let geoTestPhone: string;

    beforeEach(async () => {
      vi.mocked(mockGeocodingService.geocode).mockResolvedValue({
        lat: 32.7157,
        lon: -117.1611,
      });

      geoTestPhone = generateUniquePhone();
      const [user] = await db
        .insert(users)
        .values({
          phoneNumber: geoTestPhone,
          displayName: "Geo Test User",
          timezone: "UTC",
        })
        .returning();
      geoTestUserId = user.id;
    });

    afterEach(async () => {
      if (geoTestTripId) {
        await db.delete(events).where(eq(events.tripId, geoTestTripId));
        await db.delete(members).where(eq(members.tripId, geoTestTripId));
        await db.delete(trips).where(eq(trips.id, geoTestTripId));
      }
      await db.delete(users).where(eq(users.id, geoTestUserId));
      vi.mocked(mockGeocodingService.geocode).mockReset();
    });

    it("createTrip with destination geocodes and stores coordinates", async () => {
      vi.mocked(mockGeocodingService.geocode).mockResolvedValue({
        lat: 21.3069,
        lon: -157.8583,
      });

      const trip = await tripService.createTrip(geoTestUserId, {
        name: "Hawaii Trip",
        destination: "Honolulu, HI",
        timezone: "Pacific/Honolulu",
        allowMembersToAddEvents: true,
      });
      geoTestTripId = trip.id;

      expect(mockGeocodingService.geocode).toHaveBeenCalledWith("Honolulu, HI");
      expect(trip.destinationLat).toBe(21.3069);
      expect(trip.destinationLon).toBe(-157.8583);
    });

    it("createTrip with geocode failure still creates trip with null lat/lon", async () => {
      vi.mocked(mockGeocodingService.geocode).mockResolvedValue(null);

      const trip = await tripService.createTrip(geoTestUserId, {
        name: "Unknown Trip",
        destination: "Nonexistent Place XYZ",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      });
      geoTestTripId = trip.id;

      expect(mockGeocodingService.geocode).toHaveBeenCalledWith(
        "Nonexistent Place XYZ",
      );
      expect(trip.destinationLat).toBeNull();
      expect(trip.destinationLon).toBeNull();
    });

    it("updateTrip with destination change geocodes and stores new coordinates + deletes weather cache", async () => {
      // Create trip first
      vi.mocked(mockGeocodingService.geocode).mockResolvedValue({
        lat: 32.7157,
        lon: -117.1611,
      });
      const trip = await tripService.createTrip(geoTestUserId, {
        name: "SD Trip",
        destination: "San Diego, CA",
        timezone: "America/Los_Angeles",
        allowMembersToAddEvents: true,
      });
      geoTestTripId = trip.id;

      // Insert a weather cache entry
      await db.insert(weatherCache).values({
        tripId: trip.id,
        response: { temp: 72 },
      });

      // Update destination
      vi.mocked(mockGeocodingService.geocode).mockResolvedValue({
        lat: 40.7128,
        lon: -74.006,
      });
      const updated = await tripService.updateTrip(trip.id, geoTestUserId, {
        destination: "New York, NY",
      });

      expect(mockGeocodingService.geocode).toHaveBeenCalledWith("New York, NY");
      expect(updated.destinationLat).toBe(40.7128);
      expect(updated.destinationLon).toBe(-74.006);

      // Verify weather cache was deleted
      const cacheRows = await db
        .select()
        .from(weatherCache)
        .where(eq(weatherCache.tripId, trip.id));
      expect(cacheRows).toHaveLength(0);
    });

    it("updateTrip without destination change does not geocode", async () => {
      vi.mocked(mockGeocodingService.geocode).mockResolvedValue({
        lat: 32.7157,
        lon: -117.1611,
      });
      const trip = await tripService.createTrip(geoTestUserId, {
        name: "SD Trip",
        destination: "San Diego, CA",
        timezone: "America/Los_Angeles",
        allowMembersToAddEvents: true,
      });
      geoTestTripId = trip.id;

      // Reset mock to track calls from updateTrip only
      vi.mocked(mockGeocodingService.geocode).mockReset();

      const updated = await tripService.updateTrip(trip.id, geoTestUserId, {
        name: "Updated Name",
      });

      expect(mockGeocodingService.geocode).not.toHaveBeenCalled();
      expect(updated.name).toBe("Updated Name");
      // Coordinates should remain unchanged
      expect(updated.destinationLat).toBe(32.7157);
      expect(updated.destinationLon).toBe(-117.1611);
    });
  });

  describe("getEffectiveDateRange", () => {
    let dateTestUserId: string;
    let dateTestTripId: string;
    let dateTestPhone: string;

    beforeEach(async () => {
      vi.mocked(mockGeocodingService.geocode).mockResolvedValue({
        lat: 0,
        lon: 0,
      });
      dateTestPhone = generateUniquePhone();
      const [user] = await db
        .insert(users)
        .values({
          phoneNumber: dateTestPhone,
          displayName: "Date Range Test User",
          timezone: "UTC",
        })
        .returning();
      dateTestUserId = user.id;
    });

    afterEach(async () => {
      if (dateTestTripId) {
        await db.delete(events).where(eq(events.tripId, dateTestTripId));
        await db.delete(members).where(eq(members.tripId, dateTestTripId));
        await db.delete(trips).where(eq(trips.id, dateTestTripId));
      }
      await db.delete(users).where(eq(users.id, dateTestUserId));
      vi.mocked(mockGeocodingService.geocode).mockReset();
    });

    it("with trip dates returns trip dates", async () => {
      const trip = await tripService.createTrip(dateTestUserId, {
        name: "Dated Trip",
        destination: "Test",
        timezone: "UTC",
        startDate: "2026-06-01",
        endDate: "2026-06-10",
        allowMembersToAddEvents: true,
      });
      dateTestTripId = trip.id;

      const range = await tripService.getEffectiveDateRange(trip.id);

      expect(range.start).toBeInstanceOf(Date);
      expect(range.end).toBeInstanceOf(Date);
      expect(range.start!.toISOString()).toContain("2026-06-01");
      expect(range.end!.toISOString()).toContain("2026-06-10");
    });

    it("with no trip dates but events returns event range", async () => {
      const trip = await tripService.createTrip(dateTestUserId, {
        name: "Undated Trip",
        destination: "Test",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      });
      dateTestTripId = trip.id;

      // Add events
      await db.insert(events).values([
        {
          tripId: trip.id,
          createdBy: dateTestUserId,
          name: "Event 1",
          eventType: "activity",
          startTime: new Date("2026-07-01T10:00:00Z"),
          endTime: new Date("2026-07-01T12:00:00Z"),
        },
        {
          tripId: trip.id,
          createdBy: dateTestUserId,
          name: "Event 2",
          eventType: "meal",
          startTime: new Date("2026-07-05T18:00:00Z"),
        },
      ]);

      const range = await tripService.getEffectiveDateRange(trip.id);

      expect(range.start).toBeInstanceOf(Date);
      expect(range.end).toBeInstanceOf(Date);
      expect(range.start!.toISOString()).toBe("2026-07-01T10:00:00.000Z");
      // Event 2 has no endTime, so COALESCE uses startTime
      expect(range.end!.toISOString()).toBe("2026-07-05T18:00:00.000Z");
    });

    it("with both trip dates and events returns combined range", async () => {
      const trip = await tripService.createTrip(dateTestUserId, {
        name: "Combined Trip",
        destination: "Test",
        timezone: "UTC",
        startDate: "2026-06-15",
        endDate: "2026-06-20",
        allowMembersToAddEvents: true,
      });
      dateTestTripId = trip.id;

      // Add event that starts before trip startDate
      await db.insert(events).values({
        tripId: trip.id,
        createdBy: dateTestUserId,
        name: "Early Event",
        eventType: "travel",
        startTime: new Date("2026-06-10T08:00:00Z"),
        endTime: new Date("2026-06-25T20:00:00Z"),
      });

      const range = await tripService.getEffectiveDateRange(trip.id);

      expect(range.start).toBeInstanceOf(Date);
      expect(range.end).toBeInstanceOf(Date);
      // Event starts before trip date, so event start is used
      expect(range.start!.toISOString()).toBe("2026-06-10T08:00:00.000Z");
      // Event ends after trip date, so event end is used
      expect(range.end!.toISOString()).toBe("2026-06-25T20:00:00.000Z");
    });

    it("with no dates and no events returns nulls", async () => {
      const trip = await tripService.createTrip(dateTestUserId, {
        name: "Empty Trip",
        destination: "Test",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      });
      dateTestTripId = trip.id;

      const range = await tripService.getEffectiveDateRange(trip.id);

      expect(range.start).toBeNull();
      expect(range.end).toBeNull();
    });

    it("ignores soft-deleted events", async () => {
      const trip = await tripService.createTrip(dateTestUserId, {
        name: "Deleted Events Trip",
        destination: "Test",
        timezone: "UTC",
        allowMembersToAddEvents: true,
      });
      dateTestTripId = trip.id;

      // Add active event
      await db.insert(events).values({
        tripId: trip.id,
        createdBy: dateTestUserId,
        name: "Active Event",
        eventType: "activity",
        startTime: new Date("2026-07-01T10:00:00Z"),
        endTime: new Date("2026-07-01T12:00:00Z"),
      });

      // Add deleted event with wider range (should be ignored)
      await db.insert(events).values({
        tripId: trip.id,
        createdBy: dateTestUserId,
        name: "Deleted Event",
        eventType: "activity",
        startTime: new Date("2026-06-01T00:00:00Z"),
        endTime: new Date("2026-08-01T00:00:00Z"),
        deletedAt: new Date(),
        deletedBy: dateTestUserId,
      });

      const range = await tripService.getEffectiveDateRange(trip.id);

      expect(range.start!.toISOString()).toBe("2026-07-01T10:00:00.000Z");
      expect(range.end!.toISOString()).toBe("2026-07-01T12:00:00.000Z");
    });
  });
});
