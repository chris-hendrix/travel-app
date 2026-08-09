import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import { users, members, trips } from "@/db/schema/index.js";
import { inArray } from "drizzle-orm";
import { MutualsService } from "@/services/mutuals.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { generateUniquePhone } from "../test-utils.js";
import { PermissionDeniedError, InvalidCursorError } from "@/errors.js";

// Create service instances with db for testing
const permissionsService = new PermissionsService(db);
const mutualsService = new MutualsService(db, permissionsService);

describe("mutuals.service", () => {
  // Test data IDs tracked for cleanup
  let testUserIds: string[] = [];
  let testTripIds: string[] = [];

  // Clean up test data (safe for parallel execution)
  const cleanup = async () => {
    if (testTripIds.length > 0) {
      await db.delete(members).where(inArray(members.tripId, testTripIds));
      await db.delete(trips).where(inArray(trips.id, testTripIds));
    }

    if (testUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, testUserIds));
    }

    testUserIds = [];
    testTripIds = [];
  };

  // Helper to create a user and track for cleanup
  async function createUser(displayName: string): Promise<string> {
    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName,
        timezone: "UTC",
      })
      .returning();
    testUserIds.push(user.id);
    return user.id;
  }

  // Helper to create a trip and track for cleanup
  async function createTrip(name: string, createdBy: string): Promise<string> {
    const [trip] = await db
      .insert(trips)
      .values({
        name,
        destination: "Test Destination",
        preferredTimezone: "UTC",
        createdBy,
      })
      .returning();
    testTripIds.push(trip.id);
    return trip.id;
  }

  // Helper to add a member to a trip
  async function addMember(
    tripId: string,
    userId: string,
    opts?: { isOrganizer?: boolean; status?: "going" | "no_response" },
  ): Promise<void> {
    await db.insert(members).values({
      tripId,
      userId,
      status: opts?.status ?? "going",
      isOrganizer: opts?.isOrganizer ?? false,
    });
  }

  beforeEach(async () => {
    await cleanup();
  });

  afterEach(cleanup);

  describe("getMutuals", () => {
    it("should return mutuals sorted by sharedTripCount DESC, displayName ASC", async () => {
      // Create users
      const currentUserId = await createUser("Current User");
      const aliceId = await createUser("Alice");
      const bobId = await createUser("Bob");

      // Create 2 trips
      const trip1Id = await createTrip("Trip 1", currentUserId);
      const trip2Id = await createTrip("Trip 2", currentUserId);

      // Current user is member of both trips
      await addMember(trip1Id, currentUserId, { isOrganizer: true });
      await addMember(trip2Id, currentUserId, { isOrganizer: true });

      // Alice is in both trips (sharedTripCount = 2)
      await addMember(trip1Id, aliceId);
      await addMember(trip2Id, aliceId);

      // Bob is in only trip 1 (sharedTripCount = 1)
      await addMember(trip1Id, bobId);

      const result = await mutualsService.getMutuals({ userId: currentUserId });

      expect(result.mutuals).toHaveLength(2);
      // Alice should be first (higher shared count)
      expect(result.mutuals[0].displayName).toBe("Alice");
      expect(result.mutuals[0].sharedTripCount).toBe(2);
      // Bob should be second
      expect(result.mutuals[1].displayName).toBe("Bob");
      expect(result.mutuals[1].sharedTripCount).toBe(1);
      expect(result.nextCursor).toBeNull();
    });

    it("should handle cursor pagination correctly", async () => {
      // Create users
      const currentUserId = await createUser("Current User");
      const aliceId = await createUser("Alice");
      const bobId = await createUser("Bob");
      const charlieId = await createUser("Charlie");

      // Create a trip with all members
      const tripId = await createTrip("Trip 1", currentUserId);
      await addMember(tripId, currentUserId, { isOrganizer: true });
      await addMember(tripId, aliceId);
      await addMember(tripId, bobId);
      await addMember(tripId, charlieId);

      // Fetch first page with limit 2
      const page1 = await mutualsService.getMutuals({
        userId: currentUserId,
        limit: 2,
      });

      expect(page1.mutuals).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      // Fetch second page using cursor
      const page2 = await mutualsService.getMutuals({
        userId: currentUserId,
        limit: 2,
        cursor: page1.nextCursor!,
      });

      expect(page2.mutuals).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();

      // All three users should be across both pages (no duplicates)
      const allNames = [
        ...page1.mutuals.map((m) => m.displayName),
        ...page2.mutuals.map((m) => m.displayName),
      ];
      expect(allNames).toContain("Alice");
      expect(allNames).toContain("Bob");
      expect(allNames).toContain("Charlie");
      expect(new Set(allNames).size).toBe(3);
    });

    it("should filter by search prefix (case-insensitive)", async () => {
      const currentUserId = await createUser("Current User");
      const aliceId = await createUser("Alice Smith");
      const bobId = await createUser("Bob Jones");

      const tripId = await createTrip("Trip 1", currentUserId);
      await addMember(tripId, currentUserId, { isOrganizer: true });
      await addMember(tripId, aliceId);
      await addMember(tripId, bobId);

      // Search for "ali" (case-insensitive)
      const result = await mutualsService.getMutuals({
        userId: currentUserId,
        search: "ali",
      });

      expect(result.mutuals).toHaveLength(1);
      expect(result.mutuals[0].displayName).toBe("Alice Smith");
    });

    it("should filter by tripId to narrow to mutuals sharing a specific trip", async () => {
      const currentUserId = await createUser("Current User");
      const aliceId = await createUser("Alice");
      const bobId = await createUser("Bob");

      const trip1Id = await createTrip("Trip 1", currentUserId);
      const trip2Id = await createTrip("Trip 2", currentUserId);

      await addMember(trip1Id, currentUserId, { isOrganizer: true });
      await addMember(trip2Id, currentUserId, { isOrganizer: true });

      // Alice in trip 1 only
      await addMember(trip1Id, aliceId);
      // Bob in trip 2 only
      await addMember(trip2Id, bobId);

      // Filter to trip 1 only
      const result = await mutualsService.getMutuals({
        userId: currentUserId,
        tripId: trip1Id,
      });

      expect(result.mutuals).toHaveLength(1);
      expect(result.mutuals[0].displayName).toBe("Alice");
    });

    it("should throw InvalidCursorError for malformed cursor", async () => {
      const currentUserId = await createUser("Current User");

      await expect(
        mutualsService.getMutuals({
          userId: currentUserId,
          cursor: "not-valid-base64!!!",
        }),
      ).rejects.toThrow(InvalidCursorError);
    });

    it("should return empty results for user with no trips", async () => {
      const lonelyUserId = await createUser("Lonely User");

      const result = await mutualsService.getMutuals({
        userId: lonelyUserId,
      });

      expect(result.mutuals).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it("should populate shared trips array correctly", async () => {
      const currentUserId = await createUser("Current User");
      const aliceId = await createUser("Alice");

      const trip1Id = await createTrip("Beach Trip", currentUserId);
      const trip2Id = await createTrip("Mountain Trip", currentUserId);

      await addMember(trip1Id, currentUserId, { isOrganizer: true });
      await addMember(trip2Id, currentUserId, { isOrganizer: true });
      await addMember(trip1Id, aliceId);
      await addMember(trip2Id, aliceId);

      const result = await mutualsService.getMutuals({
        userId: currentUserId,
      });

      expect(result.mutuals).toHaveLength(1);
      const alice = result.mutuals[0];
      expect(alice.sharedTrips).toHaveLength(2);

      // Trips should be sorted by name
      const tripNames = alice.sharedTrips.map((t) => t.name);
      expect(tripNames).toContain("Beach Trip");
      expect(tripNames).toContain("Mountain Trip");

      // Each trip should have id and name
      for (const trip of alice.sharedTrips) {
        expect(trip.id).toBeDefined();
        expect(trip.name).toBeDefined();
      }
    });
  });

  describe("getMutualSuggestions", () => {
    it("should exclude existing trip members from suggestions", async () => {
      const currentUserId = await createUser("Current User");
      const aliceId = await createUser("Alice");
      const bobId = await createUser("Bob");

      // Trip 1 has current user, alice, and bob
      const trip1Id = await createTrip("Trip 1", currentUserId);
      await addMember(trip1Id, currentUserId, { isOrganizer: true });
      await addMember(trip1Id, aliceId);
      await addMember(trip1Id, bobId);

      // Trip 2 has current user and alice (but NOT bob)
      const trip2Id = await createTrip("Trip 2", currentUserId);
      await addMember(trip2Id, currentUserId, { isOrganizer: true });
      await addMember(trip2Id, aliceId);

      // Get suggestions for trip 2 - should only show Bob (not Alice who is already in trip 2)
      const result = await mutualsService.getMutualSuggestions({
        userId: currentUserId,
        tripId: trip2Id,
      });

      expect(result.mutuals).toHaveLength(1);
      expect(result.mutuals[0].displayName).toBe("Bob");
    });

    it("should throw PermissionDeniedError for non-organizer", async () => {
      const organizerId = await createUser("Organizer");
      const memberId = await createUser("Regular Member");
      const otherUserId = await createUser("Other User");

      const tripId = await createTrip("Trip 1", organizerId);
      await addMember(tripId, organizerId, { isOrganizer: true });
      await addMember(tripId, memberId); // regular member, not organizer

      // Trip 2 with member and other user so they are mutuals
      const trip2Id = await createTrip("Trip 2", memberId);
      await addMember(trip2Id, memberId, { isOrganizer: true });
      await addMember(trip2Id, otherUserId);

      await expect(
        mutualsService.getMutualSuggestions({
          userId: memberId,
          tripId: tripId, // memberId is NOT organizer of this trip
        }),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should support search filter in suggestions", async () => {
      const currentUserId = await createUser("Current User");
      const aliceId = await createUser("Alice");
      const bobId = await createUser("Bob");

      // Trip 1 has all three
      const trip1Id = await createTrip("Trip 1", currentUserId);
      await addMember(trip1Id, currentUserId, { isOrganizer: true });
      await addMember(trip1Id, aliceId);
      await addMember(trip1Id, bobId);

      // Trip 2 only has current user (so both alice and bob are suggestions)
      const trip2Id = await createTrip("Trip 2", currentUserId);
      await addMember(trip2Id, currentUserId, { isOrganizer: true });

      const result = await mutualsService.getMutualSuggestions({
        userId: currentUserId,
        tripId: trip2Id,
        search: "Ali",
      });

      expect(result.mutuals).toHaveLength(1);
      expect(result.mutuals[0].displayName).toBe("Alice");
    });
  });
});
