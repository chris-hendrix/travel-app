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
import { eq, and, isNull } from "drizzle-orm";
import { generateUniquePhone } from "../test-utils.js";

describe("Itinerary Schema Integration", () => {
  let testUserId: string;
  let testTripId: string;
  let testMemberId: string;

  beforeEach(async () => {
    // Create test user
    const userResult = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: "Test User",
        timezone: "UTC",
      })
      .returning();
    testUserId = userResult[0]!.id;

    // Create test trip
    const tripResult = await db
      .insert(trips)
      .values({
        name: "Test Trip",
        destination: "Test Destination",
        preferredTimezone: "UTC",
        createdBy: testUserId,
      })
      .returning();
    testTripId = tripResult[0]!.id;

    // Create test member
    const memberResult = await db
      .insert(members)
      .values({
        tripId: testTripId,
        userId: testUserId,
        status: "going",
      })
      .returning();
    testMemberId = memberResult[0]!.id;
  });

  afterEach(async () => {
    // Clean up in reverse order of dependencies
    // Due to cascade delete, deleting trip will clean up events, accommodations, member_travel, and members
    await db.delete(trips).where(eq(trips.id, testTripId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe("Events Table Operations", () => {
    it("should insert and query an event", async () => {
      const eventData = {
        tripId: testTripId,
        createdBy: testUserId,
        name: "Team Dinner",
        description: "Welcome dinner at restaurant",
        eventType: "meal" as const,
        location: "Local Restaurant",
        startTime: new Date("2026-03-15T18:00:00Z"),
        endTime: new Date("2026-03-15T20:00:00Z"),
        allDay: false,
        links: [
          { url: "https://restaurant.example.com", name: "Restaurant" },
          { url: "https://maps.example.com" },
        ],
      };

      const result = await db.insert(events).values(eventData).returning();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: eventData.name,
        description: eventData.description,
        eventType: eventData.eventType,
        location: eventData.location,
        allDay: false,
      });
      expect(result[0]!.id).toBeDefined();
      expect(result[0]!.createdAt).toBeInstanceOf(Date);
      expect(result[0]!.updatedAt).toBeInstanceOf(Date);
      expect(result[0]!.links).toEqual(eventData.links);

      // Query back
      const queried = await db
        .select()
        .from(events)
        .where(eq(events.id, result[0]!.id));

      expect(queried).toHaveLength(1);
      expect(queried[0]!.name).toBe(eventData.name);
    });

    it("should insert an all-day event without end time", async () => {
      const eventData = {
        tripId: testTripId,
        createdBy: testUserId,
        name: "Beach Day",
        eventType: "activity" as const,
        startTime: new Date("2026-03-16T00:00:00Z"),
        allDay: true,
      };

      const result = await db.insert(events).values(eventData).returning();

      expect(result).toHaveLength(1);
      expect(result[0]!.allDay).toBe(true);
      expect(result[0]!.endTime).toBeNull();
      expect(result[0]!.description).toBeNull();
      expect(result[0]!.location).toBeNull();
    });

    it("should handle soft delete for events", async () => {
      const eventData = {
        tripId: testTripId,
        createdBy: testUserId,
        name: "Flight Check-in",
        eventType: "travel" as const,
        startTime: new Date("2026-03-14T10:00:00Z"),
        allDay: false,
      };

      const result = await db.insert(events).values(eventData).returning();
      const eventId = result[0]!.id;

      // Soft delete
      await db
        .update(events)
        .set({
          deletedAt: new Date(),
          deletedBy: testUserId,
        })
        .where(eq(events.id, eventId));

      // Query with soft delete filter
      const activeEvents = await db
        .select()
        .from(events)
        .where(and(eq(events.tripId, testTripId), isNull(events.deletedAt)));

      expect(activeEvents).toHaveLength(0);

      // Query including soft deleted
      const allEvents = await db
        .select()
        .from(events)
        .where(eq(events.tripId, testTripId));

      expect(allEvents).toHaveLength(1);
      expect(allEvents[0]!.deletedAt).toBeInstanceOf(Date);
      expect(allEvents[0]!.deletedBy).toBe(testUserId);
    });

    it("should cascade delete events when trip is deleted", async () => {
      const eventData = {
        tripId: testTripId,
        createdBy: testUserId,
        name: "Sightseeing Tour",
        eventType: "activity" as const,
        startTime: new Date("2026-03-17T09:00:00Z"),
        allDay: false,
      };

      await db.insert(events).values(eventData);

      // Verify event exists
      const beforeDelete = await db
        .select()
        .from(events)
        .where(eq(events.tripId, testTripId));
      expect(beforeDelete).toHaveLength(1);

      // Delete trip (should cascade)
      await db.delete(trips).where(eq(trips.id, testTripId));

      // Verify event was deleted
      const afterDelete = await db
        .select()
        .from(events)
        .where(eq(events.tripId, testTripId));
      expect(afterDelete).toHaveLength(0);

      // Recreate trip for afterEach cleanup
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Test Destination",
          preferredTimezone: "UTC",
          createdBy: testUserId,
        })
        .returning();
      testTripId = tripResult[0]!.id;
    });
  });

  describe("Accommodations Table Operations", () => {
    it("should insert and query an accommodation", async () => {
      const accommodationData = {
        tripId: testTripId,
        createdBy: testUserId,
        name: "Beachside Hotel",
        address: "123 Ocean Drive, Beach City",
        description: "Luxury hotel with ocean view",
        checkIn: new Date("2026-03-15T14:00:00.000Z"),
        checkOut: new Date("2026-03-20T11:00:00.000Z"),
        links: [
          { url: "https://hotel.example.com", name: "Hotel website" },
          { url: "https://booking.example.com/123" },
        ],
      };

      const result = await db
        .insert(accommodations)
        .values(accommodationData)
        .returning();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: accommodationData.name,
        address: accommodationData.address,
        description: accommodationData.description,
        checkIn: accommodationData.checkIn,
        checkOut: accommodationData.checkOut,
      });
      expect(result[0]!.id).toBeDefined();
      expect(result[0]!.createdAt).toBeInstanceOf(Date);
      expect(result[0]!.updatedAt).toBeInstanceOf(Date);
      expect(result[0]!.links).toEqual(accommodationData.links);

      // Query back
      const queried = await db
        .select()
        .from(accommodations)
        .where(eq(accommodations.id, result[0]!.id));

      expect(queried).toHaveLength(1);
      expect(queried[0]!.name).toBe(accommodationData.name);
    });

    it("should insert accommodation without optional fields", async () => {
      const accommodationData = {
        tripId: testTripId,
        createdBy: testUserId,
        name: "Budget Inn",
        checkIn: new Date("2026-03-15T14:00:00.000Z"),
        checkOut: new Date("2026-03-16T11:00:00.000Z"),
      };

      const result = await db
        .insert(accommodations)
        .values(accommodationData)
        .returning();

      expect(result).toHaveLength(1);
      expect(result[0]!.address).toBeNull();
      expect(result[0]!.description).toBeNull();
      expect(result[0]!.links).toBeNull();
    });

    it("should handle soft delete for accommodations", async () => {
      const accommodationData = {
        tripId: testTripId,
        createdBy: testUserId,
        name: "Downtown Apartment",
        checkIn: new Date("2026-03-15T14:00:00.000Z"),
        checkOut: new Date("2026-03-18T11:00:00.000Z"),
      };

      const result = await db
        .insert(accommodations)
        .values(accommodationData)
        .returning();
      const accommodationId = result[0]!.id;

      // Soft delete
      await db
        .update(accommodations)
        .set({
          deletedAt: new Date(),
          deletedBy: testUserId,
        })
        .where(eq(accommodations.id, accommodationId));

      // Query with soft delete filter
      const activeAccommodations = await db
        .select()
        .from(accommodations)
        .where(
          and(
            eq(accommodations.tripId, testTripId),
            isNull(accommodations.deletedAt),
          ),
        );

      expect(activeAccommodations).toHaveLength(0);

      // Query including soft deleted
      const allAccommodations = await db
        .select()
        .from(accommodations)
        .where(eq(accommodations.tripId, testTripId));

      expect(allAccommodations).toHaveLength(1);
      expect(allAccommodations[0]!.deletedAt).toBeInstanceOf(Date);
      expect(allAccommodations[0]!.deletedBy).toBe(testUserId);
    });

    it("should cascade delete accommodations when trip is deleted", async () => {
      const accommodationData = {
        tripId: testTripId,
        createdBy: testUserId,
        name: "Mountain Cabin",
        checkIn: new Date("2026-03-15T14:00:00.000Z"),
        checkOut: new Date("2026-03-20T11:00:00.000Z"),
      };

      await db.insert(accommodations).values(accommodationData);

      // Verify accommodation exists
      const beforeDelete = await db
        .select()
        .from(accommodations)
        .where(eq(accommodations.tripId, testTripId));
      expect(beforeDelete).toHaveLength(1);

      // Delete trip (should cascade)
      await db.delete(trips).where(eq(trips.id, testTripId));

      // Verify accommodation was deleted
      const afterDelete = await db
        .select()
        .from(accommodations)
        .where(eq(accommodations.tripId, testTripId));
      expect(afterDelete).toHaveLength(0);

      // Recreate trip for afterEach cleanup
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Test Destination",
          preferredTimezone: "UTC",
          createdBy: testUserId,
        })
        .returning();
      testTripId = tripResult[0]!.id;
    });
  });

  describe("Member Travel Table Operations", () => {
    it("should insert and query member travel (arrival)", async () => {
      const travelData = {
        tripId: testTripId,
        memberId: testMemberId,
        travelType: "arrival" as const,
        time: new Date("2026-03-15T14:30:00Z"),
        location: "LAX Airport",
        details: "Flight AA123 from JFK",
      };

      const result = await db
        .insert(memberTravel)
        .values(travelData)
        .returning();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tripId: testTripId,
        memberId: testMemberId,
        travelType: "arrival",
        location: travelData.location,
        details: travelData.details,
      });
      expect(result[0]!.id).toBeDefined();
      expect(result[0]!.time).toBeInstanceOf(Date);
      expect(result[0]!.createdAt).toBeInstanceOf(Date);
      expect(result[0]!.updatedAt).toBeInstanceOf(Date);

      // Query back
      const queried = await db
        .select()
        .from(memberTravel)
        .where(eq(memberTravel.id, result[0]!.id));

      expect(queried).toHaveLength(1);
      expect(queried[0]!.travelType).toBe("arrival");
    });

    it("should insert member travel (departure) without optional fields", async () => {
      const travelData = {
        tripId: testTripId,
        memberId: testMemberId,
        travelType: "departure" as const,
        time: new Date("2026-03-20T10:00:00Z"),
      };

      const result = await db
        .insert(memberTravel)
        .values(travelData)
        .returning();

      expect(result).toHaveLength(1);
      expect(result[0]!.travelType).toBe("departure");
      expect(result[0]!.location).toBeNull();
      expect(result[0]!.details).toBeNull();
    });

    it("should handle soft delete for member travel", async () => {
      const travelData = {
        tripId: testTripId,
        memberId: testMemberId,
        travelType: "arrival" as const,
        time: new Date("2026-03-15T16:00:00Z"),
      };

      const result = await db
        .insert(memberTravel)
        .values(travelData)
        .returning();
      const travelId = result[0]!.id;

      // Soft delete
      await db
        .update(memberTravel)
        .set({
          deletedAt: new Date(),
          deletedBy: testUserId,
        })
        .where(eq(memberTravel.id, travelId));

      // Query with soft delete filter
      const activeTravel = await db
        .select()
        .from(memberTravel)
        .where(
          and(
            eq(memberTravel.memberId, testMemberId),
            isNull(memberTravel.deletedAt),
          ),
        );

      expect(activeTravel).toHaveLength(0);

      // Query including soft deleted
      const allTravel = await db
        .select()
        .from(memberTravel)
        .where(eq(memberTravel.memberId, testMemberId));

      expect(allTravel).toHaveLength(1);
      expect(allTravel[0]!.deletedAt).toBeInstanceOf(Date);
      expect(allTravel[0]!.deletedBy).toBe(testUserId);
    });

    it("should cascade delete member travel when trip is deleted", async () => {
      const travelData = {
        tripId: testTripId,
        memberId: testMemberId,
        travelType: "arrival" as const,
        time: new Date("2026-03-15T12:00:00Z"),
      };

      await db.insert(memberTravel).values(travelData);

      // Verify travel exists
      const beforeDelete = await db
        .select()
        .from(memberTravel)
        .where(eq(memberTravel.tripId, testTripId));
      expect(beforeDelete).toHaveLength(1);

      // Delete trip (should cascade)
      await db.delete(trips).where(eq(trips.id, testTripId));

      // Verify travel was deleted
      const afterDelete = await db
        .select()
        .from(memberTravel)
        .where(eq(memberTravel.tripId, testTripId));
      expect(afterDelete).toHaveLength(0);

      // Recreate trip and member for afterEach cleanup
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Test Trip",
          destination: "Test Destination",
          preferredTimezone: "UTC",
          createdBy: testUserId,
        })
        .returning();
      testTripId = tripResult[0]!.id;

      const memberResult = await db
        .insert(members)
        .values({
          tripId: testTripId,
          userId: testUserId,
          status: "going",
        })
        .returning();
      testMemberId = memberResult[0]!.id;
    });

    it("should cascade delete member travel when member is deleted", async () => {
      const travelData = {
        tripId: testTripId,
        memberId: testMemberId,
        travelType: "departure" as const,
        time: new Date("2026-03-20T15:00:00Z"),
      };

      await db.insert(memberTravel).values(travelData);

      // Verify travel exists
      const beforeDelete = await db
        .select()
        .from(memberTravel)
        .where(eq(memberTravel.memberId, testMemberId));
      expect(beforeDelete).toHaveLength(1);

      // Delete member (should cascade)
      await db.delete(members).where(eq(members.id, testMemberId));

      // Verify travel was deleted
      const afterDelete = await db
        .select()
        .from(memberTravel)
        .where(eq(memberTravel.memberId, testMemberId));
      expect(afterDelete).toHaveLength(0);

      // Recreate member for afterEach cleanup
      const memberResult = await db
        .insert(members)
        .values({
          tripId: testTripId,
          userId: testUserId,
          status: "going",
        })
        .returning();
      testMemberId = memberResult[0]!.id;
    });
  });

  describe("Array Column Operations", () => {
    it("should handle empty array for links", async () => {
      const eventData = {
        tripId: testTripId,
        createdBy: testUserId,
        name: "Event with empty links",
        eventType: "activity" as const,
        startTime: new Date("2026-03-16T10:00:00Z"),
        allDay: false,
        links: [],
      };

      const result = await db.insert(events).values(eventData).returning();

      expect(result[0]!.links).toEqual([]);
    });

    it("should handle null for links", async () => {
      const eventData = {
        tripId: testTripId,
        createdBy: testUserId,
        name: "Event with null links",
        eventType: "activity" as const,
        startTime: new Date("2026-03-16T11:00:00Z"),
        allDay: false,
        links: null,
      };

      const result = await db.insert(events).values(eventData).returning();

      expect(result[0]!.links).toBeNull();
    });

    it("should query events by array contains", async () => {
      const testUrl = "https://unique-event-url.example.com";

      await db.insert(events).values({
        tripId: testTripId,
        createdBy: testUserId,
        name: "Event with specific link",
        eventType: "activity" as const,
        startTime: new Date("2026-03-16T12:00:00Z"),
        allDay: false,
        links: [
          { url: testUrl },
          { url: "https://other-url.example.com" },
        ],
      });

      // Note: Drizzle doesn't have built-in array contains, but we can verify the data
      const allEvents = await db
        .select()
        .from(events)
        .where(eq(events.tripId, testTripId));

      const eventsWithUrl = allEvents.filter(
        (e) => e.links?.some((link) => link.url === testUrl),
      );

      expect(eventsWithUrl).toHaveLength(1);
      expect(eventsWithUrl[0]!.name).toBe("Event with specific link");
    });

    it("should round-trip links with optional name", async () => {
      const eventData = {
        tripId: testTripId,
        createdBy: testUserId,
        name: "Event with named links",
        eventType: "activity" as const,
        startTime: new Date("2026-03-16T13:00:00Z"),
        allDay: false,
        links: [
          { url: "https://reservation.example.com", name: "Reservation" },
          { url: "https://maps.example.com" },
        ],
      };

      const result = await db.insert(events).values(eventData).returning();
      const queried = await db
        .select()
        .from(events)
        .where(eq(events.id, result[0]!.id));

      expect(queried[0]!.links).toEqual(eventData.links);
    });
  });
});
