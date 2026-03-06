import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { generateUniquePhone } from "../test-utils.js";
import { db } from "@/config/database.js";
import { users, members, trips } from "@/db/schema/index.js";
import { inArray } from "drizzle-orm";

describe("Mutuals Routes", () => {
  let app: FastifyInstance;

  // Track IDs for cleanup
  let testUserIds: string[] = [];
  let testTripIds: string[] = [];

  afterEach(async () => {
    // Cleanup in FK order
    if (testTripIds.length > 0) {
      await db.delete(members).where(inArray(members.tripId, testTripIds));
      await db.delete(trips).where(inArray(trips.id, testTripIds));
    }
    if (testUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, testUserIds));
    }
    testUserIds = [];
    testTripIds = [];

    if (app) {
      await app.close();
    }
  });

  // Helper to create a user and track for cleanup
  async function createUser(displayName: string): Promise<{
    id: string;
    displayName: string;
  }> {
    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName,
        timezone: "UTC",
      })
      .returning();
    testUserIds.push(user.id);
    return { id: user.id, displayName: user.displayName };
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

  // Helper to add a member
  async function addMember(
    tripId: string,
    userId: string,
    opts?: { isOrganizer?: boolean },
  ): Promise<void> {
    await db.insert(members).values({
      tripId,
      userId,
      status: "going",
      isOrganizer: opts?.isOrganizer ?? false,
    });
  }

  describe("GET /api/mutuals", () => {
    it("should return 401 without auth", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/mutuals",
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return paginated mutuals", async () => {
      app = await buildApp();

      const currentUser = await createUser("Current User");
      const alice = await createUser("Alice");
      const bob = await createUser("Bob");

      const tripId = await createTrip("Trip 1", currentUser.id);
      await addMember(tripId, currentUser.id, { isOrganizer: true });
      await addMember(tripId, alice.id);
      await addMember(tripId, bob.id);

      const token = app.jwt.sign({
        sub: currentUser.id,
        name: currentUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/mutuals",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.mutuals).toHaveLength(2);
      expect(body.nextCursor).toBeNull();

      // Each mutual should have expected fields
      for (const mutual of body.mutuals) {
        expect(mutual).toHaveProperty("id");
        expect(mutual).toHaveProperty("displayName");
        expect(mutual).toHaveProperty("sharedTripCount");
        expect(mutual).toHaveProperty("sharedTrips");
      }
    });

    it("should support search filter", async () => {
      app = await buildApp();

      const currentUser = await createUser("Current User");
      const alice = await createUser("Alice");
      const bob = await createUser("Bob");

      const tripId = await createTrip("Trip 1", currentUser.id);
      await addMember(tripId, currentUser.id, { isOrganizer: true });
      await addMember(tripId, alice.id);
      await addMember(tripId, bob.id);

      const token = app.jwt.sign({
        sub: currentUser.id,
        name: currentUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/mutuals?search=Ali",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.mutuals).toHaveLength(1);
      expect(body.mutuals[0].displayName).toBe("Alice");
    });

    it("should support tripId filter", async () => {
      app = await buildApp();

      const currentUser = await createUser("Current User");
      const alice = await createUser("Alice");
      const bob = await createUser("Bob");

      const trip1Id = await createTrip("Trip 1", currentUser.id);
      const trip2Id = await createTrip("Trip 2", currentUser.id);

      await addMember(trip1Id, currentUser.id, { isOrganizer: true });
      await addMember(trip2Id, currentUser.id, { isOrganizer: true });
      await addMember(trip1Id, alice.id);
      await addMember(trip2Id, bob.id);

      const token = app.jwt.sign({
        sub: currentUser.id,
        name: currentUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/mutuals?tripId=${trip1Id}`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.mutuals).toHaveLength(1);
      expect(body.mutuals[0].displayName).toBe("Alice");
    });

    it("should return 400 for malformed cursor", async () => {
      app = await buildApp();

      const user = await createUser("Cursor Test User");

      const token = app.jwt.sign({
        sub: user.id,
        name: user.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/mutuals?cursor=garbage",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return empty for user with no trips", async () => {
      app = await buildApp();

      const lonelyUser = await createUser("Lonely User");

      const token = app.jwt.sign({
        sub: lonelyUser.id,
        name: lonelyUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/mutuals",
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.mutuals).toHaveLength(0);
      expect(body.nextCursor).toBeNull();
    });
  });

  describe("GET /api/trips/:tripId/mutual-suggestions", () => {
    it("should return 401 without auth", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/trips/10000000-0000-4000-8000-000000000001/mutual-suggestions",
      });

      expect(response.statusCode).toBe(401);
    });

    it("should exclude existing trip members from suggestions", async () => {
      app = await buildApp();

      const currentUser = await createUser("Current User");
      const alice = await createUser("Alice");
      const bob = await createUser("Bob");

      // Trip 1: current user + alice + bob
      const trip1Id = await createTrip("Trip 1", currentUser.id);
      await addMember(trip1Id, currentUser.id, { isOrganizer: true });
      await addMember(trip1Id, alice.id);
      await addMember(trip1Id, bob.id);

      // Trip 2: current user + alice (bob is NOT a member)
      const trip2Id = await createTrip("Trip 2", currentUser.id);
      await addMember(trip2Id, currentUser.id, { isOrganizer: true });
      await addMember(trip2Id, alice.id);

      const token = app.jwt.sign({
        sub: currentUser.id,
        name: currentUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip2Id}/mutual-suggestions`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.mutuals).toHaveLength(1);
      expect(body.mutuals[0].displayName).toBe("Bob");
    });

    it("should return 403 for non-organizer", async () => {
      app = await buildApp();

      const organizer = await createUser("Organizer");
      const regularMember = await createUser("Regular Member");

      const tripId = await createTrip("Trip 1", organizer.id);
      await addMember(tripId, organizer.id, { isOrganizer: true });
      await addMember(tripId, regularMember.id); // not organizer

      const token = app.jwt.sign({
        sub: regularMember.id,
        name: regularMember.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${tripId}/mutual-suggestions`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
