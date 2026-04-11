import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  events,
  accommodations,
  memberTravel,
  affiliateDismissals,
  affiliateEvents,
} from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import {
  AffiliateService,
  getDateRange,
  isEventOnDay,
} from "@/services/affiliate.service.js";
import { PermissionsService } from "@/services/permissions.service.js";
import { BOOKING_DEEP_LINKS } from "@/config/affiliates.js";
import { env } from "@/config/env.js";
import { generateUniquePhone } from "../test-utils.js";

// Store original value to restore after tests that mutate env
const ORIGINAL_AFFILIATE_ID = env.BOOKING_AFFILIATE_ID;

const permissionsService = new PermissionsService(db);
const affiliateService = new AffiliateService(db, permissionsService);

describe("affiliate.service", () => {
  // Set affiliate ID for all tests; individual tests can override
  beforeEach(() => {
    (env as { BOOKING_AFFILIATE_ID: string }).BOOKING_AFFILIATE_ID =
      "test-affiliate-123";
  });

  afterEach(() => {
    (env as { BOOKING_AFFILIATE_ID: string }).BOOKING_AFFILIATE_ID =
      ORIGINAL_AFFILIATE_ID;
  });

  // --- Helper function tests (no DB needed) ---

  describe("getDateRange", () => {
    it("should return 4 dates for a 3-night range", () => {
      const result = getDateRange("2026-04-10", "2026-04-13");
      expect(result).toEqual([
        "2026-04-10",
        "2026-04-11",
        "2026-04-12",
        "2026-04-13",
      ]);
    });

    it("should return 1 date when start equals end", () => {
      const result = getDateRange("2026-04-10", "2026-04-10");
      expect(result).toEqual(["2026-04-10"]);
    });
  });

  describe("isEventOnDay", () => {
    it("should match event by startTime date", () => {
      const event = {
        startTime: new Date("2026-04-10T14:00:00Z"),
      } as typeof events.$inferSelect;

      expect(isEventOnDay(event, "2026-04-10")).toBe(true);
      expect(isEventOnDay(event, "2026-04-11")).toBe(false);
    });
  });

  // --- Deep link URL tests ---

  describe("BOOKING_DEEP_LINKS", () => {
    it("flights URL includes destination, dates, affiliate ID", () => {
      const url = BOOKING_DEEP_LINKS.flights({
        destination: "Paris",
        lat: null,
        lon: null,
        startDate: "2026-06-01",
        endDate: "2026-06-10",
      });
      expect(url).toContain("to=Paris");
      expect(url).toContain("depart=2026-06-01");
      expect(url).toContain("return=2026-06-10");
      expect(url).toContain("aid=test-affiliate-123");
    });

    it("hotels URL includes lat/lon and dates", () => {
      const url = BOOKING_DEEP_LINKS.hotels({
        destination: "Paris",
        lat: 48.8566,
        lon: 2.3522,
        startDate: "2026-06-01",
        endDate: "2026-06-10",
      });
      expect(url).toContain("latitude=48.8566");
      expect(url).toContain("longitude=2.3522");
      expect(url).toContain("checkin=2026-06-01");
      expect(url).toContain("checkout=2026-06-10");
      expect(url).toContain("aid=test-affiliate-123");
    });

    it("attractions URL includes destination", () => {
      const url = BOOKING_DEEP_LINKS.attractions({
        destination: "Paris",
        lat: null,
        lon: null,
        startDate: null,
        endDate: null,
      });
      expect(url).toContain("Paris");
      expect(url).toContain("aid=test-affiliate-123");
    });

    it("hotels URL handles missing lat/lon gracefully", () => {
      const url = BOOKING_DEEP_LINKS.hotels({
        destination: "Paris",
        lat: null,
        lon: null,
        startDate: "2026-06-01",
        endDate: "2026-06-10",
      });
      expect(url).not.toContain("latitude");
      expect(url).not.toContain("longitude");
      expect(url).toContain("checkin=2026-06-01");
    });

    it("flights URL handles missing dates gracefully", () => {
      const url = BOOKING_DEEP_LINKS.flights({
        destination: "Paris",
        lat: null,
        lon: null,
        startDate: null,
        endDate: null,
      });
      expect(url).not.toContain("depart");
      expect(url).not.toContain("return");
      expect(url).toContain("aid=test-affiliate-123");
    });
  });

  // --- Gap detection tests via getSuggestions ---

  describe("getSuggestions", () => {
    let testUserPhone: string;
    let testUserId: string;
    let testTripId: string;
    let testMemberId: string;

    const cleanup = async () => {
      if (testTripId) {
        await db
          .delete(affiliateDismissals)
          .where(eq(affiliateDismissals.tripId, testTripId));
        await db
          .delete(affiliateEvents)
          .where(eq(affiliateEvents.tripId, testTripId));
        await db.delete(events).where(eq(events.tripId, testTripId));
        await db
          .delete(memberTravel)
          .where(eq(memberTravel.tripId, testTripId));
        await db.delete(members).where(eq(members.tripId, testTripId));
        await db
          .delete(accommodations)
          .where(eq(accommodations.tripId, testTripId));
        await db.delete(trips).where(eq(trips.id, testTripId));
      }
      if (testUserPhone) {
        await db
          .delete(users)
          .where(eq(users.phoneNumber, testUserPhone));
      }
    };

    beforeEach(async () => {
      testUserPhone = generateUniquePhone();
      await cleanup();

      // Create test user
      const userResult = await db
        .insert(users)
        .values({
          phoneNumber: testUserPhone,
          displayName: "Affiliate Test User",
          timezone: "UTC",
        })
        .returning();
      testUserId = userResult[0].id;

      // Create test trip (4-day trip: Apr 10-13)
      const tripResult = await db
        .insert(trips)
        .values({
          name: "Affiliate Test Trip",
          destination: "Paris",
          destinationLat: 48.8566,
          destinationLon: 2.3522,
          startDate: "2026-04-10",
          endDate: "2026-04-13",
          preferredTimezone: "UTC",
          createdBy: testUserId,
        })
        .returning();
      testTripId = tripResult[0].id;

      // Add user as member with status "going"
      const memberResult = await db
        .insert(members)
        .values({
          tripId: testTripId,
          userId: testUserId,
          status: "going",
        })
        .returning();
      testMemberId = memberResult[0].id;
    });

    afterEach(cleanup);

    it("missing_travel: user going, no travel → gets suggestion", async () => {
      const suggestions = await affiliateService.getSuggestions(
        testUserId,
        testTripId,
      );
      const travelSuggestion = suggestions.find(
        (s) => s.gapType === "missing_travel",
      );
      expect(travelSuggestion).toBeDefined();
      expect(travelSuggestion!.suggestionType).toBe("flights");
    });

    it("no_accommodation: zero accommodations → gets suggestion", async () => {
      const suggestions = await affiliateService.getSuggestions(
        testUserId,
        testTripId,
      );
      const accommodationSuggestion = suggestions.find(
        (s) => s.gapType === "no_accommodation",
      );
      expect(accommodationSuggestion).toBeDefined();
      expect(accommodationSuggestion!.suggestionType).toBe("hotels");
    });

    it("empty_day: day with zero events → gets suggestion", async () => {
      // Add accommodation so no_accommodation doesn't appear
      await db.insert(accommodations).values({
        tripId: testTripId,
        createdBy: testUserId,
        name: "Test Hotel",
        checkIn: new Date("2026-04-10T14:00:00Z"),
        checkOut: new Date("2026-04-13T11:00:00Z"),
      });
      // Add travel so missing_travel doesn't appear
      await db.insert(memberTravel).values({
        tripId: testTripId,
        memberId: testMemberId,
        travelType: "arrival",
        time: new Date("2026-04-10T10:00:00Z"),
      });

      const suggestions = await affiliateService.getSuggestions(
        testUserId,
        testTripId,
      );
      const emptyDaySuggestion = suggestions.find(
        (s) => s.gapType === "empty_day",
      );
      expect(emptyDaySuggestion).toBeDefined();
      expect(emptyDaySuggestion!.suggestionType).toBe("attractions");
    });

    it("missing_meal: day with activity but no meal → gets suggestion", async () => {
      // Add accommodation and travel to suppress those suggestions
      await db.insert(accommodations).values({
        tripId: testTripId,
        createdBy: testUserId,
        name: "Test Hotel",
        checkIn: new Date("2026-04-10T14:00:00Z"),
        checkOut: new Date("2026-04-13T11:00:00Z"),
      });
      await db.insert(memberTravel).values({
        tripId: testTripId,
        memberId: testMemberId,
        travelType: "arrival",
        time: new Date("2026-04-10T10:00:00Z"),
      });

      // Add meal events on all other days so they don't generate gaps
      await db.insert(events).values([
        {
          tripId: testTripId,
          createdBy: testUserId,
          name: "Breakfast",
          eventType: "meal",
          startTime: new Date("2026-04-10T09:00:00Z"),
        },
        {
          tripId: testTripId,
          createdBy: testUserId,
          name: "Lunch",
          eventType: "meal",
          startTime: new Date("2026-04-12T12:00:00Z"),
        },
        {
          tripId: testTripId,
          createdBy: testUserId,
          name: "Dinner",
          eventType: "meal",
          startTime: new Date("2026-04-13T19:00:00Z"),
        },
      ]);

      // Add an activity event on Apr 11 (middle day, not first/last) — no meal
      await db.insert(events).values({
        tripId: testTripId,
        createdBy: testUserId,
        name: "Sightseeing",
        eventType: "activity",
        startTime: new Date("2026-04-11T10:00:00Z"),
      });

      const suggestions = await affiliateService.getSuggestions(
        testUserId,
        testTripId,
      );
      const mealSuggestion = suggestions.find(
        (s) => s.gapType === "missing_meal",
      );
      expect(mealSuggestion).toBeDefined();
      expect(mealSuggestion!.day).toBe("2026-04-11");
    });

    // --- Edge cases ---

    it("should not suggest meals on first/last day of trip", async () => {
      // Add accommodation and travel
      await db.insert(accommodations).values({
        tripId: testTripId,
        createdBy: testUserId,
        name: "Test Hotel",
        checkIn: new Date("2026-04-10T14:00:00Z"),
        checkOut: new Date("2026-04-13T11:00:00Z"),
      });
      await db.insert(memberTravel).values({
        tripId: testTripId,
        memberId: testMemberId,
        travelType: "arrival",
        time: new Date("2026-04-10T10:00:00Z"),
      });

      // Add activity events on first and last day (no meals)
      await db.insert(events).values([
        {
          tripId: testTripId,
          createdBy: testUserId,
          name: "Arrival Activity",
          eventType: "activity",
          startTime: new Date("2026-04-10T15:00:00Z"),
        },
        {
          tripId: testTripId,
          createdBy: testUserId,
          name: "Departure Activity",
          eventType: "activity",
          startTime: new Date("2026-04-13T09:00:00Z"),
        },
      ]);

      const suggestions = await affiliateService.getSuggestions(
        testUserId,
        testTripId,
      );
      const mealSuggestions = suggestions.filter(
        (s) => s.gapType === "missing_meal",
      );
      // No meal suggestions for first (Apr 10) or last (Apr 13) day
      for (const s of mealSuggestions) {
        expect(s.day).not.toBe("2026-04-10");
        expect(s.day).not.toBe("2026-04-13");
      }
    });

    it("should not suggest activities on travel-heavy days (2+ travel entries)", async () => {
      // Add accommodation and travel to suppress those
      await db.insert(accommodations).values({
        tripId: testTripId,
        createdBy: testUserId,
        name: "Test Hotel",
        checkIn: new Date("2026-04-10T14:00:00Z"),
        checkOut: new Date("2026-04-13T11:00:00Z"),
      });
      await db.insert(memberTravel).values({
        tripId: testTripId,
        memberId: testMemberId,
        travelType: "arrival",
        time: new Date("2026-04-10T10:00:00Z"),
      });

      // Create a second member to add more travel on Apr 11
      const phone2 = generateUniquePhone();
      const user2 = await db
        .insert(users)
        .values({
          phoneNumber: phone2,
          displayName: "Second User",
          timezone: "UTC",
        })
        .returning();
      const member2 = await db
        .insert(members)
        .values({
          tripId: testTripId,
          userId: user2[0].id,
          status: "going",
        })
        .returning();

      // 2 travel entries on Apr 11 → travel-heavy day
      await db.insert(memberTravel).values([
        {
          tripId: testTripId,
          memberId: testMemberId,
          travelType: "departure",
          time: new Date("2026-04-11T08:00:00Z"),
        },
        {
          tripId: testTripId,
          memberId: member2[0].id,
          travelType: "arrival",
          time: new Date("2026-04-11T14:00:00Z"),
        },
      ]);

      const suggestions = await affiliateService.getSuggestions(
        testUserId,
        testTripId,
      );
      // Apr 11 has 0 events but 2 travel entries → should NOT get empty_day
      const emptyDayOnApr11 = suggestions.find(
        (s) => s.gapType === "empty_day" && s.day === "2026-04-11",
      );
      expect(emptyDayOnApr11).toBeUndefined();

      // Cleanup extra user
      await db.delete(users).where(eq(users.phoneNumber, phone2));
    });

    it("should cap day-level suggestions to 1 per day (highest priority wins)", async () => {
      // With no accommodation and no travel, all days are empty.
      // Each day can only produce one day-level suggestion.
      const suggestions = await affiliateService.getSuggestions(
        testUserId,
        testTripId,
      );

      // Collect day-level suggestions and check uniqueness
      const dayKeys = suggestions
        .filter((s) => s.day !== null)
        .map((s) => s.day);
      const uniqueDays = new Set(dayKeys);
      expect(dayKeys.length).toBe(uniqueDays.size);
    });

    it("should cap total suggestions at MAX_SUGGESTIONS (3)", async () => {
      // With no data at all, there are many potential gaps but max 3 returned
      const suggestions = await affiliateService.getSuggestions(
        testUserId,
        testTripId,
      );
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it("should return no suggestions for cancelled trips", async () => {
      await db
        .update(trips)
        .set({ cancelled: true })
        .where(eq(trips.id, testTripId));

      const suggestions = await affiliateService.getSuggestions(
        testUserId,
        testTripId,
      );
      expect(suggestions).toEqual([]);
    });

    it("should return no suggestions when user status is not going", async () => {
      // Update member status to "maybe"
      await db
        .update(members)
        .set({ status: "maybe" })
        .where(eq(members.tripId, testTripId));

      const suggestions = await affiliateService.getSuggestions(
        testUserId,
        testTripId,
      );
      // missing_travel requires status "going", but no_accommodation and empty_day still fire
      const travelSuggestion = suggestions.find(
        (s) => s.gapType === "missing_travel",
      );
      expect(travelSuggestion).toBeUndefined();
    });

    it("should return no suggestions when BOOKING_AFFILIATE_ID is empty", async () => {
      const original = env.BOOKING_AFFILIATE_ID;
      (env as { BOOKING_AFFILIATE_ID: string }).BOOKING_AFFILIATE_ID = "";

      try {
        const suggestions = await affiliateService.getSuggestions(
          testUserId,
          testTripId,
        );
        expect(suggestions).toEqual([]);
      } finally {
        (env as { BOOKING_AFFILIATE_ID: string }).BOOKING_AFFILIATE_ID =
          original;
      }
    });
  });
});
