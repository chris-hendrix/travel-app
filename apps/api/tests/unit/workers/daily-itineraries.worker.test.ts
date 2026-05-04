import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import type { Job } from "pg-boss";
import { db } from "@/config/database.js";
import { events, members, trips, users } from "@/db/schema/index.js";
import { eq, or } from "drizzle-orm";
import { handleDailyItineraries } from "@/queues/workers/daily-itineraries.worker.js";
import type { WorkerDeps, NotificationBatchPayload } from "@/queues/types.js";
import { QUEUE } from "@/queues/types.js";
import type { SendOptions } from "pg-boss";
import { generateUniquePhone } from "../../test-utils.js";

/** Remove all stale data from previous test runs using the test marker name */
async function cleanupStaleData() {
  const staleUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.displayName, "Itinerary Organizer"));

  for (const user of staleUsers) {
    const staleTrips = await db
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.createdBy, user.id));

    for (const trip of staleTrips) {
      await db.delete(events).where(eq(events.tripId, trip.id));
      await db.delete(members).where(eq(members.tripId, trip.id));
    }
    await db.delete(trips).where(eq(trips.createdBy, user.id));
  }

  if (staleUsers.length > 0) {
    await db.delete(users).where(eq(users.displayName, "Itinerary Organizer"));
  }
}

describe("daily-itineraries.worker", () => {
  let testOrganizerPhone: string;
  let testOrganizerId: string;
  let testTripId: string;

  let mockDeps: WorkerDeps;

  const cleanup = async () => {
    const phoneNumbers = [testOrganizerPhone].filter(Boolean);

    if (testTripId) {
      await db.delete(events).where(eq(events.tripId, testTripId));
      await db.delete(members).where(eq(members.tripId, testTripId));
      await db.delete(trips).where(eq(trips.id, testTripId));
    }

    if (phoneNumbers.length > 0) {
      await db
        .delete(users)
        .where(
          or(...phoneNumbers.map((phone) => eq(users.phoneNumber, phone))),
        );
    }
  };

  beforeAll(async () => {
    await cleanupStaleData();
  });

  afterAll(async () => {
    await cleanupStaleData();
  });

  beforeEach(async () => {
    vi.useFakeTimers();

    testOrganizerPhone = generateUniquePhone();

    await cleanup();

    // Create test user
    const organizerResult = await db
      .insert(users)
      .values({
        phoneNumber: testOrganizerPhone,
        displayName: "Itinerary Organizer",
        timezone: "America/New_York",
      })
      .returning();
    testOrganizerId = organizerResult[0].id;

    mockDeps = {
      db,
      boss: {
        send: vi.fn().mockResolvedValue(undefined),
      } as unknown as WorkerDeps["boss"],
      smsService: {
        sendMessage: vi.fn(),
      } as unknown as WorkerDeps["smsService"],
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      } as unknown as WorkerDeps["logger"],
    };
  });

  afterEach(async () => {
    await cleanup();
    vi.useRealTimers();
  });

  function createMockJob(): Job<object> {
    return {
      id: "test-cron-job-id",
      name: "daily-itineraries",
      data: {},
      expireInSeconds: 900,
      heartbeatSeconds: null,
      signal: new AbortController().signal,
    } as Job<object>;
  }

  /**
   * Helper to create a trip with given timezone and date range.
   * Sets the testTripId so cleanup can find it.
   */
  async function createTrip(
    overrides: {
      preferredTimezone?: string;
      startDate?: string;
      endDate?: string;
      cancelled?: boolean;
    } = {},
  ) {
    const tripResult = await db
      .insert(trips)
      .values({
        name: "Daily Itinerary Trip",
        destination: "Test Destination",
        preferredTimezone: overrides.preferredTimezone ?? "UTC",
        createdBy: testOrganizerId,
        startDate: overrides.startDate ?? "2026-03-15",
        endDate: overrides.endDate ?? "2026-03-20",
        cancelled: overrides.cancelled ?? false,
      })
      .returning();
    testTripId = tripResult[0].id;

    await db.insert(members).values({
      tripId: testTripId,
      userId: testOrganizerId,
      status: "going",
      isOrganizer: true,
    });

    return tripResult[0];
  }

  it("should enqueue batch job for trip in morning window (8:00 AM UTC)", async () => {
    // Set fake time to 8:00 AM UTC on 2026-03-15
    vi.setSystemTime(new Date("2026-03-15T08:00:00Z"));

    const trip = await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    expect(mockDeps.boss.send).toHaveBeenCalledTimes(1);
    expect(mockDeps.boss.send).toHaveBeenCalledWith(
      QUEUE.NOTIFICATION_BATCH,
      {
        tripId: trip.id,
        type: "daily_itinerary",
        title: "Daily Itinerary Trip - Today's Schedule",
        body: "No events scheduled for today.",
        data: {
          tripId: trip.id,
          referenceId: `${trip.id}:2026-03-15`,
        },
      },
      {
        singletonKey: `daily-itinerary:${trip.id}:2026-03-15`,
        expireInSeconds: 900,
      },
    );
  });

  it("should not enqueue for trip outside morning window", async () => {
    // Set fake time to 10:00 AM UTC (outside 7:45-8:15 window)
    vi.setSystemTime(new Date("2026-03-15T10:00:00Z"));

    await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    expect(mockDeps.boss.send).not.toHaveBeenCalled();
  });

  it("should skip cancelled trips", async () => {
    vi.setSystemTime(new Date("2026-03-15T08:00:00Z"));

    await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
      cancelled: true,
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    expect(mockDeps.boss.send).not.toHaveBeenCalled();
  });

  it("should skip trips without start date", async () => {
    vi.setSystemTime(new Date("2026-03-15T08:00:00Z"));

    // Create trip without dates directly (bypass helper to set null dates)
    const tripResult = await db
      .insert(trips)
      .values({
        name: "No Dates Trip",
        destination: "Test Destination",
        preferredTimezone: "UTC",
        createdBy: testOrganizerId,
        startDate: null,
        endDate: null,
      })
      .returning();
    testTripId = tripResult[0].id;

    await db.insert(members).values({
      tripId: testTripId,
      userId: testOrganizerId,
      status: "going",
      isOrganizer: true,
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    expect(mockDeps.boss.send).not.toHaveBeenCalled();
  });

  it("should skip trips where today is before start date", async () => {
    // Set fake time to 2026-03-14 08:00 UTC -- before trip starts on 2026-03-15
    vi.setSystemTime(new Date("2026-03-14T08:00:00Z"));

    await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    expect(mockDeps.boss.send).not.toHaveBeenCalled();
  });

  it("should skip trips where today is after end date", async () => {
    // Set fake time to 2026-03-21 08:00 UTC -- after trip ends on 2026-03-20
    vi.setSystemTime(new Date("2026-03-21T08:00:00Z"));

    await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    expect(mockDeps.boss.send).not.toHaveBeenCalled();
  });

  it("should format event body correctly with times", async () => {
    // 8:00 AM UTC on 2026-03-15
    vi.setSystemTime(new Date("2026-03-15T08:00:00Z"));

    await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    // Create events for today
    await db.insert(events).values({
      tripId: testTripId,
      createdBy: testOrganizerId,
      name: "Morning Coffee",
      eventType: "food_and_drink",
      startTime: new Date("2026-03-15T09:00:00Z"),
      allDay: false,
    });

    await db.insert(events).values({
      tripId: testTripId,
      createdBy: testOrganizerId,
      name: "City Tour",
      eventType: "misc",
      startTime: new Date("2026-03-15T14:30:00Z"),
      allDay: false,
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    expect(mockDeps.boss.send).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(mockDeps.boss.send).mock
      .calls[0][1] as NotificationBatchPayload;
    expect(payload.body).toBe(
      "1. 9:00 AM - Morning Coffee\n2. 2:30 PM - City Tour",
    );
  });

  it("should send 'No events scheduled' when trip has no events today", async () => {
    vi.setSystemTime(new Date("2026-03-15T08:00:00Z"));

    await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    const payload = vi.mocked(mockDeps.boss.send).mock
      .calls[0][1] as NotificationBatchPayload;
    expect(payload.body).toBe("No events scheduled for today.");
  });

  it("should exclude deleted events from the itinerary", async () => {
    vi.setSystemTime(new Date("2026-03-15T08:00:00Z"));

    await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    // Create a deleted event
    await db.insert(events).values({
      tripId: testTripId,
      createdBy: testOrganizerId,
      name: "Deleted Event",
      eventType: "misc",
      startTime: new Date("2026-03-15T10:00:00Z"),
      allDay: false,
      deletedAt: new Date(),
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    const payload = vi.mocked(mockDeps.boss.send).mock
      .calls[0][1] as NotificationBatchPayload;
    expect(payload.body).toBe("No events scheduled for today.");
  });

  it("should only include events for today, not other days", async () => {
    vi.setSystemTime(new Date("2026-03-15T08:00:00Z"));

    await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    // Event for today
    await db.insert(events).values({
      tripId: testTripId,
      createdBy: testOrganizerId,
      name: "Today Event",
      eventType: "misc",
      startTime: new Date("2026-03-15T10:00:00Z"),
      allDay: false,
    });

    // Event for tomorrow (should not appear)
    await db.insert(events).values({
      tripId: testTripId,
      createdBy: testOrganizerId,
      name: "Tomorrow Event",
      eventType: "misc",
      startTime: new Date("2026-03-16T10:00:00Z"),
      allDay: false,
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    const payload = vi.mocked(mockDeps.boss.send).mock
      .calls[0][1] as NotificationBatchPayload;
    expect(payload.body).toBe("1. 10:00 AM - Today Event");
    expect(payload.body).not.toContain("Tomorrow Event");
  });

  it("should use correct singletonKey and referenceId format", async () => {
    vi.setSystemTime(new Date("2026-03-15T08:00:00Z"));

    const trip = await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    const options = vi.mocked(mockDeps.boss.send).mock
      .calls[0][2] as SendOptions;
    expect(options.singletonKey).toBe(`daily-itinerary:${trip.id}:2026-03-15`);
    expect(options.expireInSeconds).toBe(900);

    const payload = vi.mocked(mockDeps.boss.send).mock
      .calls[0][1] as NotificationBatchPayload;
    expect(payload.data.referenceId).toBe(`${trip.id}:2026-03-15`);
    expect(payload.data.tripId).toBe(trip.id);
  });

  it("should handle timezone-aware morning window (America/New_York)", async () => {
    // 8:00 AM Eastern = 13:00 UTC (during EDT, March is DST)
    // EDT offset is UTC-4
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));

    await createTrip({
      preferredTimezone: "America/New_York",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    expect(mockDeps.boss.send).toHaveBeenCalledTimes(1);
  });

  it("should not trigger for timezone where it is not morning", async () => {
    // 8:00 AM UTC -- but for America/Los_Angeles this is midnight
    vi.setSystemTime(new Date("2026-03-15T08:00:00Z"));

    await createTrip({
      preferredTimezone: "America/Los_Angeles",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    expect(mockDeps.boss.send).not.toHaveBeenCalled();
  });

  it("should handle morning window boundary at 7:45 AM", async () => {
    // 7:45 AM UTC
    vi.setSystemTime(new Date("2026-03-15T07:45:00Z"));

    await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    expect(mockDeps.boss.send).toHaveBeenCalledTimes(1);
  });

  it("should handle morning window boundary at 8:15 AM", async () => {
    // 8:15 AM UTC
    vi.setSystemTime(new Date("2026-03-15T08:15:00Z"));

    await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    expect(mockDeps.boss.send).toHaveBeenCalledTimes(1);
  });

  it("should not trigger at 7:44 AM (just before window)", async () => {
    vi.setSystemTime(new Date("2026-03-15T07:44:00Z"));

    await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    expect(mockDeps.boss.send).not.toHaveBeenCalled();
  });

  it("should not trigger at 8:16 AM (just after window)", async () => {
    vi.setSystemTime(new Date("2026-03-15T08:16:00Z"));

    await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    expect(mockDeps.boss.send).not.toHaveBeenCalled();
  });

  it("should log after processing", async () => {
    vi.setSystemTime(new Date("2026-03-15T08:00:00Z"));

    await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    expect(mockDeps.logger.info).toHaveBeenCalledWith(
      { count: 1 },
      "enqueued daily itinerary batches",
    );
  });

  it("should set notification title to trip name with schedule suffix", async () => {
    vi.setSystemTime(new Date("2026-03-15T08:00:00Z"));

    await createTrip({
      preferredTimezone: "UTC",
      startDate: "2026-03-15",
      endDate: "2026-03-20",
    });

    await handleDailyItineraries(createMockJob(), mockDeps);

    const payload = vi.mocked(mockDeps.boss.send).mock
      .calls[0][1] as NotificationBatchPayload;
    expect(payload.title).toBe("Daily Itinerary Trip - Today's Schedule");
    expect(payload.type).toBe("daily_itinerary");
  });
});
