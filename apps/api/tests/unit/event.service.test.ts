import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import { users, trips, members, events } from "@/db/schema/index.js";
import { eq, or } from "drizzle-orm";
import { EventService } from "@/services/event.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { generateUniquePhone } from "../test-utils.js";
import {
  EventNotFoundError,
  PermissionDeniedError,
  TripNotFoundError,
  InvalidDateRangeError,
} from "@/errors.js";

// Create service instances with db for testing
const permissionsService = new PermissionsService(db);
const eventService = new EventService(db, permissionsService);

describe("event.service", () => {
  // Use unique test data for each test run to enable parallel execution
  let testOrganizerPhone: string;
  let testMemberPhone: string;
  let testNonMemberPhone: string;

  let testOrganizerId: string;
  let testMemberId: string;
  let testNonMemberId: string;

  let testTripId: string;
  let testEventId: string;

  // Clean up test data (safe for parallel execution)
  const cleanup = async () => {
    // Delete in reverse order of foreign key dependencies
    if (testTripId) {
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
        allowMembersToAddEvents: true,
      })
      .returning();
    testTripId = tripResult[0].id;

    // Add organizer as member with status='going'
    await db.insert(members).values({
      tripId: testTripId,
      userId: testOrganizerId,
      status: "going",
    });

    // Add regular member with status='going'
    await db.insert(members).values({
      tripId: testTripId,
      userId: testMemberId,
      status: "going",
    });

    // Create a test event
    const eventResult = await db
      .insert(events)
      .values({
        tripId: testTripId,
        createdBy: testOrganizerId,
        name: "Test Event",
        eventType: "activity",
        startTime: new Date("2026-06-15T10:00:00Z"),
        endTime: new Date("2026-06-15T12:00:00Z"),
      })
      .returning();
    testEventId = eventResult[0].id;
  });

  afterEach(cleanup);

  describe("createEvent", () => {
    it("should create an event as organizer", async () => {
      const eventData = {
        name: "New Event",
        description: "Event description",
        eventType: "meal" as const,
        location: "Restaurant",
        startTime: "2026-06-16T18:00:00Z",
        endTime: "2026-06-16T20:00:00Z",
        allDay: false,
        links: [{ url: "https://example.com" }],
      };

      const event = await eventService.createEvent(
        testOrganizerId,
        testTripId,
        eventData,
      );

      expect(event).toBeDefined();
      expect(event.name).toBe(eventData.name);
      expect(event.description).toBe(eventData.description);
      expect(event.eventType).toBe(eventData.eventType);
      expect(event.location).toBe(eventData.location);
      expect(event.startTime).toEqual(new Date(eventData.startTime));
      expect(event.endTime).toEqual(new Date(eventData.endTime));
      expect(event.allDay).toBe(false);
      expect(event.links).toEqual(eventData.links);
      expect(event.createdBy).toBe(testOrganizerId);
      expect(event.tripId).toBe(testTripId);
    });

    it("should create an event as member with status=going", async () => {
      const eventData = {
        name: "Member Event",
        eventType: "activity" as const,
        startTime: "2026-06-17T10:00:00Z",
      };

      const event = await eventService.createEvent(
        testMemberId,
        testTripId,
        eventData,
      );

      expect(event).toBeDefined();
      expect(event.name).toBe(eventData.name);
      expect(event.createdBy).toBe(testMemberId);
    });

    it("should throw PermissionDeniedError for non-member", async () => {
      const eventData = {
        name: "Unauthorized Event",
        eventType: "activity" as const,
        startTime: "2026-06-18T10:00:00Z",
      };

      await expect(
        eventService.createEvent(testNonMemberId, testTripId, eventData),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw TripNotFoundError for non-existent trip", async () => {
      const eventData = {
        name: "Event",
        eventType: "activity" as const,
        startTime: "2026-06-18T10:00:00Z",
      };

      await expect(
        eventService.createEvent(
          testOrganizerId,
          "00000000-0000-0000-0000-000000000000",
          eventData,
        ),
      ).rejects.toThrow(TripNotFoundError);
    });

    it("should throw InvalidDateRangeError if endTime is before startTime", async () => {
      const eventData = {
        name: "Invalid Event",
        eventType: "activity" as const,
        startTime: "2026-06-18T12:00:00Z",
        endTime: "2026-06-18T10:00:00Z",
      };

      await expect(
        eventService.createEvent(testOrganizerId, testTripId, eventData),
      ).rejects.toThrow(InvalidDateRangeError);
    });

    it("should create event without optional fields", async () => {
      const eventData = {
        name: "Minimal Event",
        eventType: "travel" as const,
        startTime: "2026-06-19T08:00:00Z",
      };

      const event = await eventService.createEvent(
        testOrganizerId,
        testTripId,
        eventData,
      );

      expect(event).toBeDefined();
      expect(event.name).toBe(eventData.name);
      expect(event.description).toBeNull();
      expect(event.location).toBeNull();
      expect(event.endTime).toBeNull();
      expect(event.links).toBeNull();
    });
  });

  describe("getEvent", () => {
    it("should get an event by ID", async () => {
      const event = await eventService.getEvent(testEventId);

      expect(event).toBeDefined();
      expect(event?.id).toBe(testEventId);
      expect(event?.name).toBe("Test Event");
    });

    it("should return null for non-existent event", async () => {
      const event = await eventService.getEvent(
        "00000000-0000-0000-0000-000000000000",
      );

      expect(event).toBeNull();
    });

    it("should return null for soft-deleted event", async () => {
      // Soft delete the event
      await eventService.deleteEvent(testOrganizerId, testEventId);

      const event = await eventService.getEvent(testEventId);

      expect(event).toBeNull();
    });
  });

  describe("getEventsByTrip", () => {
    it("should get all events for a trip", async () => {
      const eventsList = await eventService.getEventsByTrip(testTripId);

      expect(eventsList).toHaveLength(1);
      expect(eventsList[0].id).toBe(testEventId);
    });

    it("should exclude soft-deleted events by default", async () => {
      // Soft delete the event
      await eventService.deleteEvent(testOrganizerId, testEventId);

      const eventsList = await eventService.getEventsByTrip(testTripId);

      expect(eventsList).toHaveLength(0);
    });

    it("should include soft-deleted events when includeDeleted=true", async () => {
      // Soft delete the event
      await eventService.deleteEvent(testOrganizerId, testEventId);

      const eventsList = await eventService.getEventsByTrip(testTripId, true);

      expect(eventsList).toHaveLength(1);
      expect(eventsList[0].deletedAt).not.toBeNull();
    });

    it("should return empty array for trip with no events", async () => {
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

      const eventsList = await eventService.getEventsByTrip(tripResult[0].id);

      expect(eventsList).toEqual([]);

      // Cleanup
      await db.delete(trips).where(eq(trips.id, tripResult[0].id));
    });
  });

  describe("updateEvent", () => {
    it("should update event as creator", async () => {
      const updateData = {
        name: "Updated Event",
        description: "Updated description",
        location: "New Location",
      };

      const updatedEvent = await eventService.updateEvent(
        testOrganizerId,
        testEventId,
        updateData,
      );

      expect(updatedEvent.name).toBe(updateData.name);
      expect(updatedEvent.description).toBe(updateData.description);
      expect(updatedEvent.location).toBe(updateData.location);
    });

    it("should update event as trip organizer (not creator)", async () => {
      // Create event by member
      const memberEventResult = await db
        .insert(events)
        .values({
          tripId: testTripId,
          createdBy: testMemberId,
          name: "Member Event",
          eventType: "meal",
          startTime: new Date("2026-06-20T12:00:00Z"),
        })
        .returning();

      const updateData = {
        name: "Updated by Organizer",
      };

      const updatedEvent = await eventService.updateEvent(
        testOrganizerId,
        memberEventResult[0].id,
        updateData,
      );

      expect(updatedEvent.name).toBe(updateData.name);
    });

    it("should throw PermissionDeniedError for non-authorized user", async () => {
      const updateData = {
        name: "Unauthorized Update",
      };

      await expect(
        eventService.updateEvent(testNonMemberId, testEventId, updateData),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw EventNotFoundError for non-existent event", async () => {
      const updateData = {
        name: "Updated",
      };

      await expect(
        eventService.updateEvent(
          testOrganizerId,
          "00000000-0000-0000-0000-000000000000",
          updateData,
        ),
      ).rejects.toThrow(EventNotFoundError);
    });

    it("should throw InvalidDateRangeError if updated endTime is before startTime", async () => {
      const updateData = {
        endTime: "2026-06-15T09:00:00Z", // Before existing startTime (10:00)
      };

      await expect(
        eventService.updateEvent(testOrganizerId, testEventId, updateData),
      ).rejects.toThrow(InvalidDateRangeError);
    });

    it("should allow partial updates", async () => {
      const updateData = {
        description: "Partially updated description",
      };

      const updatedEvent = await eventService.updateEvent(
        testOrganizerId,
        testEventId,
        updateData,
      );

      expect(updatedEvent.description).toBe("Partially updated description");
      expect(updatedEvent.name).toBe("Test Event"); // Unchanged
    });
  });

  describe("deleteEvent", () => {
    it("should soft delete event as creator", async () => {
      await eventService.deleteEvent(testOrganizerId, testEventId);

      const event = await eventService.getEvent(testEventId);
      expect(event).toBeNull();

      // Verify soft delete (check directly in DB)
      const [deletedEvent] = await db
        .select()
        .from(events)
        .where(eq(events.id, testEventId));

      expect(deletedEvent.deletedAt).not.toBeNull();
      expect(deletedEvent.deletedBy).toBe(testOrganizerId);
    });

    it("should soft delete event as trip organizer", async () => {
      // Create event by member
      const memberEventResult = await db
        .insert(events)
        .values({
          tripId: testTripId,
          createdBy: testMemberId,
          name: "Member Event",
          eventType: "activity",
          startTime: new Date("2026-06-21T14:00:00Z"),
        })
        .returning();

      await eventService.deleteEvent(testOrganizerId, memberEventResult[0].id);

      const event = await eventService.getEvent(memberEventResult[0].id);
      expect(event).toBeNull();
    });

    it("should throw PermissionDeniedError for non-authorized user", async () => {
      await expect(
        eventService.deleteEvent(testNonMemberId, testEventId),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw EventNotFoundError for non-existent event", async () => {
      await expect(
        eventService.deleteEvent(
          testOrganizerId,
          "00000000-0000-0000-0000-000000000000",
        ),
      ).rejects.toThrow(EventNotFoundError);
    });
  });

  describe("restoreEvent", () => {
    it("should restore soft-deleted event as organizer", async () => {
      // Soft delete the event
      await eventService.deleteEvent(testOrganizerId, testEventId);

      // Verify it's deleted
      let event = await eventService.getEvent(testEventId);
      expect(event).toBeNull();

      // Restore the event
      const restoredEvent = await eventService.restoreEvent(
        testOrganizerId,
        testEventId,
      );

      expect(restoredEvent.id).toBe(testEventId);
      expect(restoredEvent.deletedAt).toBeNull();
      expect(restoredEvent.deletedBy).toBeNull();

      // Verify it's visible again
      event = await eventService.getEvent(testEventId);
      expect(event).not.toBeNull();
    });

    it("should throw PermissionDeniedError for non-organizer", async () => {
      // Soft delete the event
      await eventService.deleteEvent(testOrganizerId, testEventId);

      // Try to restore as non-member
      await expect(
        eventService.restoreEvent(testNonMemberId, testEventId),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it("should throw EventNotFoundError for non-existent event", async () => {
      await expect(
        eventService.restoreEvent(
          testOrganizerId,
          "00000000-0000-0000-0000-000000000000",
        ),
      ).rejects.toThrow(EventNotFoundError);
    });
  });

  describe("edge cases", () => {
    it("should handle event with all-day flag", async () => {
      const eventData = {
        name: "All Day Event",
        eventType: "activity" as const,
        startTime: "2026-06-22T00:00:00Z",
        allDay: true,
      };

      const event = await eventService.createEvent(
        testOrganizerId,
        testTripId,
        eventData,
      );

      expect(event.allDay).toBe(true);
    });

    it("should handle event with multiple links", async () => {
      const eventData = {
        name: "Event with Links",
        eventType: "travel" as const,
        startTime: "2026-06-23T08:00:00Z",
        links: [
          { url: "https://example.com/booking" },
          { url: "https://example.com/confirmation" },
        ],
      };

      const event = await eventService.createEvent(
        testOrganizerId,
        testTripId,
        eventData,
      );

      expect(event.links).toHaveLength(2);
      expect(event.links).toEqual(eventData.links);
    });

    it("should handle event with named links", async () => {
      const eventData = {
        name: "Event with Named Link",
        eventType: "activity" as const,
        startTime: "2026-06-24T08:00:00Z",
        links: [
          { url: "https://example.com/reservation", name: "Reservation" },
          { url: "https://maps.example.com" },
        ],
      };

      const event = await eventService.createEvent(
        testOrganizerId,
        testTripId,
        eventData,
      );

      expect(event.links).toEqual(eventData.links);
      expect(event.links?.[0]?.name).toBe("Reservation");
      expect(event.links?.[1]?.name).toBeUndefined();
    });

    it("should handle updating only time fields", async () => {
      const updateData = {
        startTime: "2026-06-15T11:00:00Z",
        endTime: "2026-06-15T13:00:00Z",
      };

      const updatedEvent = await eventService.updateEvent(
        testOrganizerId,
        testEventId,
        updateData,
      );

      expect(updatedEvent.startTime).toEqual(new Date(updateData.startTime));
      expect(updatedEvent.endTime).toEqual(new Date(updateData.endTime));
      expect(updatedEvent.name).toBe("Test Event"); // Unchanged
    });
  });
});
