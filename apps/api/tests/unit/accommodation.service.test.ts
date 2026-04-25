import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import { users, trips, members, accommodations } from "@/db/schema/index.js";
import { eq, or } from "drizzle-orm";
import { AccommodationService } from "@/services/accommodation.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { generateUniquePhone } from "../test-utils.js";
import {
  AccommodationNotFoundError,
  PermissionDeniedError,
  TripNotFoundError,
  InvalidDateRangeError,
} from "@/errors.js";

// Create service instances with db for testing
const permissionsService = new PermissionsService(db);
const accommodationService = new AccommodationService(db, permissionsService);

describe("accommodation.service", () => {
  // Use unique test data for each test run to enable parallel execution
  let testOrganizerPhone: string;
  let testMemberPhone: string;
  let testNonMemberPhone: string;

  let testOrganizerId: string;
  let testMemberId: string;
  let testNonMemberId: string;

  let testTripId: string;
  let testAccommodationId: string;

  // Clean up test data (safe for parallel execution)
  const cleanup = async () => {
    // Delete in reverse order of foreign key dependencies
    if (testTripId) {
      await db
        .delete(accommodations)
        .where(eq(accommodations.tripId, testTripId));
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

    // Add organizer as member with status='going'
    await db.insert(members).values({
      tripId: testTripId,
      userId: testOrganizerId,
      status: "going",
    });

    // Add regular member with status='maybe' (not an organizer)
    await db.insert(members).values({
      tripId: testTripId,
      userId: testMemberId,
      status: "maybe",
    });

    // Create a test accommodation
    const accommodationResult = await db
      .insert(accommodations)
      .values({
        tripId: testTripId,
        createdBy: testOrganizerId,
        name: "Test Hotel",
        address: "123 Test St",
        checkIn: new Date("2026-06-10T14:00:00.000Z"),
        checkOut: new Date("2026-06-20T11:00:00.000Z"),
      })
      .returning();
    testAccommodationId = accommodationResult[0].id;
  });

  afterEach(cleanup);

  describe("createAccommodation", () => {
    it("should create accommodation as organizer", async () => {
      const accommodationData = {
        name: "Beach Resort",
        address: "456 Beach Rd",
        description: "Luxury beachfront resort",
        checkIn: "2026-07-01T14:00:00.000Z",
        checkOut: "2026-07-10T11:00:00.000Z",
        links: [{ url: "https://resort.example.com" }],
      };

      const accommodation = await accommodationService.createAccommodation(
        testOrganizerId,
        testTripId,
        accommodationData,
      );

      expect(accommodation).toBeDefined();
      expect(accommodation.name).toBe(accommodationData.name);
      expect(accommodation.address).toBe(accommodationData.address);
      expect(accommodation.description).toBe(accommodationData.description);
      expect(accommodation.checkIn).toBeInstanceOf(Date);
      expect(accommodation.checkOut).toBeInstanceOf(Date);
      expect(accommodation.links).toEqual(accommodationData.links);
      expect(accommodation.createdBy).toBe(testOrganizerId);
      expect(accommodation.tripId).toBe(testTripId);
    });

    it("should throw PermissionDeniedError for regular member", async () => {
      const accommodationData = {
        name: "Unauthorized Hotel",
        checkIn: "2026-08-01T14:00:00.000Z",
        checkOut: "2026-08-05T11:00:00.000Z",
      };

      await expect(
        accommodationService.createAccommodation(
          testMemberId,
          testTripId,
          accommodationData,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      const accommodationData = {
        name: "Unauthorized Hotel",
        checkIn: "2026-08-01T14:00:00.000Z",
        checkOut: "2026-08-05T11:00:00.000Z",
      };

      await expect(
        accommodationService.createAccommodation(
          testNonMemberId,
          testTripId,
          accommodationData,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw TripNotFoundError for non-existent trip", async () => {
      const accommodationData = {
        name: "Hotel",
        checkIn: "2026-08-01T14:00:00.000Z",
        checkOut: "2026-08-05T11:00:00.000Z",
      };

      await expect(
        accommodationService.createAccommodation(
          testOrganizerId,
          "00000000-0000-0000-0000-000000000000",
          accommodationData,
        ),
      ).rejects.toThrow(TripNotFoundError);
    });

    it("should throw InvalidDateRangeError if checkOut is before checkIn", async () => {
      const accommodationData = {
        name: "Invalid Hotel",
        checkIn: "2026-08-10T14:00:00.000Z",
        checkOut: "2026-08-05T11:00:00.000Z",
      };

      await expect(
        accommodationService.createAccommodation(
          testOrganizerId,
          testTripId,
          accommodationData,
        ),
      ).rejects.toThrow(InvalidDateRangeError);
    });

    it("should create accommodation without optional fields", async () => {
      const accommodationData = {
        name: "Minimal Hotel",
        checkIn: "2026-09-01T14:00:00.000Z",
        checkOut: "2026-09-05T11:00:00.000Z",
      };

      const accommodation = await accommodationService.createAccommodation(
        testOrganizerId,
        testTripId,
        accommodationData,
      );

      expect(accommodation).toBeDefined();
      expect(accommodation.name).toBe(accommodationData.name);
      expect(accommodation.address).toBeNull();
      expect(accommodation.description).toBeNull();
      expect(accommodation.links).toBeNull();
    });
  });

  describe("getAccommodation", () => {
    it("should get an accommodation by ID", async () => {
      const accommodation =
        await accommodationService.getAccommodation(testAccommodationId);

      expect(accommodation).toBeDefined();
      expect(accommodation?.id).toBe(testAccommodationId);
      expect(accommodation?.name).toBe("Test Hotel");
    });

    it("should return null for non-existent accommodation", async () => {
      const accommodation = await accommodationService.getAccommodation(
        "00000000-0000-0000-0000-000000000000",
      );

      expect(accommodation).toBeNull();
    });

    it("should return null for soft-deleted accommodation", async () => {
      // Soft delete the accommodation
      await accommodationService.deleteAccommodation(
        testOrganizerId,
        testAccommodationId,
      );

      const accommodation =
        await accommodationService.getAccommodation(testAccommodationId);

      expect(accommodation).toBeNull();
    });
  });

  describe("getAccommodationsByTrip", () => {
    it("should get all accommodations for a trip", async () => {
      const accommodationsList =
        await accommodationService.getAccommodationsByTrip(testTripId);

      expect(accommodationsList).toHaveLength(1);
      expect(accommodationsList[0].id).toBe(testAccommodationId);
    });

    it("should exclude soft-deleted accommodations by default", async () => {
      // Soft delete the accommodation
      await accommodationService.deleteAccommodation(
        testOrganizerId,
        testAccommodationId,
      );

      const accommodationsList =
        await accommodationService.getAccommodationsByTrip(testTripId);

      expect(accommodationsList).toHaveLength(0);
    });

    it("should include soft-deleted accommodations when includeDeleted=true", async () => {
      // Soft delete the accommodation
      await accommodationService.deleteAccommodation(
        testOrganizerId,
        testAccommodationId,
      );

      const accommodationsList =
        await accommodationService.getAccommodationsByTrip(testTripId, true);

      expect(accommodationsList).toHaveLength(1);
      expect(accommodationsList[0].deletedAt).not.toBeNull();
    });

    it("should return empty array for trip with no accommodations", async () => {
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

      const accommodationsList =
        await accommodationService.getAccommodationsByTrip(tripResult[0].id);

      expect(accommodationsList).toEqual([]);

      // Cleanup
      await db.delete(trips).where(eq(trips.id, tripResult[0].id));
    });
  });

  describe("updateAccommodation", () => {
    it("should update accommodation as organizer", async () => {
      const updateData = {
        name: "Updated Hotel",
        description: "Updated description",
        address: "789 New St",
      };

      const updatedAccommodation =
        await accommodationService.updateAccommodation(
          testOrganizerId,
          testAccommodationId,
          updateData,
        );

      expect(updatedAccommodation.name).toBe(updateData.name);
      expect(updatedAccommodation.description).toBe(updateData.description);
      expect(updatedAccommodation.address).toBe(updateData.address);
    });

    it("should throw PermissionDeniedError for regular member", async () => {
      const updateData = {
        name: "Unauthorized Update",
      };

      await expect(
        accommodationService.updateAccommodation(
          testMemberId,
          testAccommodationId,
          updateData,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      const updateData = {
        name: "Unauthorized Update",
      };

      await expect(
        accommodationService.updateAccommodation(
          testNonMemberId,
          testAccommodationId,
          updateData,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw AccommodationNotFoundError for non-existent accommodation", async () => {
      const updateData = {
        name: "Updated",
      };

      await expect(
        accommodationService.updateAccommodation(
          testOrganizerId,
          "00000000-0000-0000-0000-000000000000",
          updateData,
        ),
      ).rejects.toThrow(AccommodationNotFoundError);
    });

    it("should throw InvalidDateRangeError if updated checkOut is before checkIn", async () => {
      const updateData = {
        checkOut: "2026-06-05T11:00:00.000Z", // Before existing checkIn
      };

      await expect(
        accommodationService.updateAccommodation(
          testOrganizerId,
          testAccommodationId,
          updateData,
        ),
      ).rejects.toThrow(InvalidDateRangeError);
    });

    it("should allow partial updates", async () => {
      const updateData = {
        description: "New description only",
      };

      const updatedAccommodation =
        await accommodationService.updateAccommodation(
          testOrganizerId,
          testAccommodationId,
          updateData,
        );

      expect(updatedAccommodation.description).toBe(updateData.description);
      expect(updatedAccommodation.name).toBe("Test Hotel"); // Unchanged
    });

    it("should update date range correctly", async () => {
      const updateData = {
        checkIn: "2026-06-12T14:00:00.000Z",
        checkOut: "2026-06-22T11:00:00.000Z",
      };

      const updatedAccommodation =
        await accommodationService.updateAccommodation(
          testOrganizerId,
          testAccommodationId,
          updateData,
        );

      expect(updatedAccommodation.checkIn).toBeInstanceOf(Date);
      expect(updatedAccommodation.checkOut).toBeInstanceOf(Date);
    });
  });

  describe("deleteAccommodation", () => {
    it("should soft delete accommodation as organizer", async () => {
      await accommodationService.deleteAccommodation(
        testOrganizerId,
        testAccommodationId,
      );

      const accommodation =
        await accommodationService.getAccommodation(testAccommodationId);
      expect(accommodation).toBeNull();

      // Verify soft delete (check directly in DB)
      const [deletedAccommodation] = await db
        .select()
        .from(accommodations)
        .where(eq(accommodations.id, testAccommodationId));

      expect(deletedAccommodation.deletedAt).not.toBeNull();
      expect(deletedAccommodation.deletedBy).toBe(testOrganizerId);
    });

    it("should throw PermissionDeniedError for regular member", async () => {
      await expect(
        accommodationService.deleteAccommodation(
          testMemberId,
          testAccommodationId,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      await expect(
        accommodationService.deleteAccommodation(
          testNonMemberId,
          testAccommodationId,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw AccommodationNotFoundError for non-existent accommodation", async () => {
      await expect(
        accommodationService.deleteAccommodation(
          testOrganizerId,
          "00000000-0000-0000-0000-000000000000",
        ),
      ).rejects.toThrow(AccommodationNotFoundError);
    });
  });

  describe("restoreAccommodation", () => {
    it("should restore soft-deleted accommodation as organizer", async () => {
      // Soft delete the accommodation
      await accommodationService.deleteAccommodation(
        testOrganizerId,
        testAccommodationId,
      );

      // Verify it's deleted
      let accommodation =
        await accommodationService.getAccommodation(testAccommodationId);
      expect(accommodation).toBeNull();

      // Restore the accommodation
      const restoredAccommodation =
        await accommodationService.restoreAccommodation(
          testOrganizerId,
          testAccommodationId,
        );

      expect(restoredAccommodation.id).toBe(testAccommodationId);
      expect(restoredAccommodation.deletedAt).toBeNull();
      expect(restoredAccommodation.deletedBy).toBeNull();

      // Verify it's visible again
      accommodation =
        await accommodationService.getAccommodation(testAccommodationId);
      expect(accommodation).not.toBeNull();
    });

    it("should throw PermissionDeniedError for non-organizer", async () => {
      // Soft delete the accommodation
      await accommodationService.deleteAccommodation(
        testOrganizerId,
        testAccommodationId,
      );

      // Try to restore as non-organizer
      await expect(
        accommodationService.restoreAccommodation(
          testMemberId,
          testAccommodationId,
        ),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw AccommodationNotFoundError for non-existent accommodation", async () => {
      await expect(
        accommodationService.restoreAccommodation(
          testOrganizerId,
          "00000000-0000-0000-0000-000000000000",
        ),
      ).rejects.toThrow(AccommodationNotFoundError);
    });
  });

  describe("edge cases", () => {
    it("should handle accommodation with multiple links", async () => {
      const accommodationData = {
        name: "Hotel with Links",
        checkIn: "2026-10-01T14:00:00.000Z",
        checkOut: "2026-10-05T11:00:00.000Z",
        links: [
          { url: "https://booking.example.com" },
          { url: "https://confirmation.example.com" },
        ],
      };

      const accommodation = await accommodationService.createAccommodation(
        testOrganizerId,
        testTripId,
        accommodationData,
      );

      expect(accommodation.links).toHaveLength(2);
      expect(accommodation.links).toEqual(accommodationData.links);
    });

    it("should handle accommodation with named links", async () => {
      const accommodationData = {
        name: "Hotel with Named Links",
        checkIn: "2026-10-10T14:00:00.000Z",
        checkOut: "2026-10-12T11:00:00.000Z",
        links: [
          { url: "https://airbnb.example.com/listing", name: "Airbnb" },
          { url: "https://maps.example.com/hotel" },
        ],
      };

      const accommodation = await accommodationService.createAccommodation(
        testOrganizerId,
        testTripId,
        accommodationData,
      );

      expect(accommodation.links).toEqual(accommodationData.links);
      expect(accommodation.links?.[0]?.name).toBe("Airbnb");
      expect(accommodation.links?.[1]?.name).toBeUndefined();
    });

    it("should handle same-day check-in and check-out as invalid", async () => {
      const accommodationData = {
        name: "Same Day Hotel",
        checkIn: "2026-11-01T14:00:00.000Z",
        checkOut: "2026-11-01T14:00:00.000Z",
      };

      await expect(
        accommodationService.createAccommodation(
          testOrganizerId,
          testTripId,
          accommodationData,
        ),
      ).rejects.toThrow(InvalidDateRangeError);
    });

    it("should handle long description", async () => {
      const longDescription = "A".repeat(2000);
      const accommodationData = {
        name: "Hotel with Long Description",
        description: longDescription,
        checkIn: "2026-12-01T14:00:00.000Z",
        checkOut: "2026-12-05T11:00:00.000Z",
      };

      const accommodation = await accommodationService.createAccommodation(
        testOrganizerId,
        testTripId,
        accommodationData,
      );

      expect(accommodation.description).toBe(longDescription);
    });
  });
});
