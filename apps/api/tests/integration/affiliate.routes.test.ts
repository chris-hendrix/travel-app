import { describe, it, expect, afterEach, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../helpers.js";
import { db } from "@/config/database.js";
import {
  users,
  trips,
  members,
  affiliateEvents,
} from "@/db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { env } from "@/config/env.js";
import { generateUniquePhone } from "../test-utils.js";

const ORIGINAL_AFFILIATE_ID = env.BOOKING_AFFILIATE_ID;

describe("Affiliate Routes", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    // Mutate the parsed env singleton directly — setting process.env has no
    // effect because env is computed once at module load via Zod parse.
    (env as { BOOKING_AFFILIATE_ID: string }).BOOKING_AFFILIATE_ID =
      "test-affiliate-123";
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    (env as { BOOKING_AFFILIATE_ID: string }).BOOKING_AFFILIATE_ID =
      ORIGINAL_AFFILIATE_ID;
  });

  // Helper to create a user, trip, and member for tests
  async function createTestTripWithMember(opts?: {
    memberStatus?: string;
    startDate?: string;
    endDate?: string;
    destination?: string;
  }) {
    const [testUser] = await db
      .insert(users)
      .values({
        phoneNumber: generateUniquePhone(),
        displayName: "Test User",
        timezone: "UTC",
      })
      .returning();

    const [trip] = await db
      .insert(trips)
      .values({
        name: "Test Trip",
        destination: opts?.destination ?? "Paris",
        preferredTimezone: "Europe/Paris",
        createdBy: testUser.id,
        startDate: opts?.startDate ?? "2026-07-01",
        endDate: opts?.endDate ?? "2026-07-03",
      })
      .returning();

    await db.insert(members).values({
      tripId: trip.id,
      userId: testUser.id,
      status: opts?.memberStatus ?? "going",
    });

    return { testUser, trip };
  }

  describe("GET /api/trips/:tripId/suggestions", () => {
    it("should return 401 without auth token", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/suggestions",
      });

      expect(response.statusCode).toBe(401);
    });

    it("should return suggestions for a trip with gaps", async () => {
      app = await buildApp();
      const { testUser, trip } = await createTestTripWithMember();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/suggestions`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.suggestions)).toBe(true);
      // Trip with no accommodations and member "going" with no travel should have suggestions
      expect(body.suggestions.length).toBeGreaterThan(0);

      // Each suggestion should have the expected shape
      for (const suggestion of body.suggestions) {
        expect(suggestion).toHaveProperty("id");
        expect(suggestion).toHaveProperty("gapType");
        expect(suggestion).toHaveProperty("suggestionType");
        expect(suggestion).toHaveProperty("title");
        expect(suggestion).toHaveProperty("description");
        expect(suggestion).toHaveProperty("affiliateUrl");
        expect(suggestion).toHaveProperty("partner");
        expect(suggestion.partner).toHaveProperty("slug");
        expect(suggestion.partner).toHaveProperty("name");
        expect(suggestion).toHaveProperty("dismissKey");
      }
    });

    it("should return empty suggestions for non-member of the trip", async () => {
      app = await buildApp();
      const { trip } = await createTestTripWithMember();

      // Create a separate user who is NOT a member
      const [outsider] = await db
        .insert(users)
        .values({
          phoneNumber: generateUniquePhone(),
          displayName: "Outsider",
          timezone: "UTC",
        })
        .returning();

      const token = app.jwt.sign({
        sub: outsider.id,
        name: outsider.displayName,
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/suggestions`,
        cookies: { auth_token: token },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.suggestions).toHaveLength(0);
    });

    it("should respect dismissals", async () => {
      app = await buildApp();
      const { testUser, trip } = await createTestTripWithMember();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      // Get initial suggestions
      const initialResponse = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/suggestions`,
        cookies: { auth_token: token },
      });

      const initialBody = JSON.parse(initialResponse.body);
      expect(initialBody.suggestions.length).toBeGreaterThan(0);

      const firstSuggestion = initialBody.suggestions[0];

      // Dismiss the first suggestion (use gapType, not suggestionType)
      await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/suggestions/dismiss`,
        cookies: { auth_token: token },
        payload: {
          suggestionType: firstSuggestion.gapType,
          suggestionKey: firstSuggestion.dismissKey,
        },
      });

      // Get suggestions again - dismissed one should be gone
      const afterResponse = await app.inject({
        method: "GET",
        url: `/api/trips/${trip.id}/suggestions`,
        cookies: { auth_token: token },
      });

      const afterBody = JSON.parse(afterResponse.body);
      const dismissedStillPresent = afterBody.suggestions.some(
        (s: { gapType: string; dismissKey: string }) =>
          s.gapType === firstSuggestion.gapType &&
          s.dismissKey === firstSuggestion.dismissKey,
      );
      expect(dismissedStillPresent).toBe(false);
    });
  });

  describe("POST /api/trips/:tripId/suggestions/dismiss", () => {
    it("should return 204 on successful dismiss", async () => {
      app = await buildApp();
      const { testUser, trip } = await createTestTripWithMember();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/suggestions/dismiss`,
        cookies: { auth_token: token },
        payload: {
          suggestionType: "hotels",
          suggestionKey: "trip",
        },
      });

      expect(response.statusCode).toBe(204);
    });

    it("should be idempotent (dismissing same suggestion twice does not error)", async () => {
      app = await buildApp();
      const { testUser, trip } = await createTestTripWithMember();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const payload = {
        suggestionType: "hotels",
        suggestionKey: "trip",
      };

      const first = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/suggestions/dismiss`,
        cookies: { auth_token: token },
        payload,
      });
      expect(first.statusCode).toBe(204);

      const second = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/suggestions/dismiss`,
        cookies: { auth_token: token },
        payload,
      });
      expect(second.statusCode).toBe(204);
    });

    it("should return 401 without auth", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/suggestions/dismiss",
        payload: {
          suggestionType: "hotels",
          suggestionKey: "trip",
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /api/affiliate/click", () => {
    it("should log a click event and return success", async () => {
      app = await buildApp();
      const { testUser, trip } = await createTestTripWithMember();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/affiliate/click",
        cookies: { auth_token: token },
        payload: {
          partnerSlug: "booking-com",
          tripId: trip.id,
          suggestionType: "hotels",
          affiliateUrl: "https://www.booking.com/searchresults.html?aid=test",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("redirectUrl");
      expect(body.redirectUrl).toBe(
        "https://www.booking.com/searchresults.html?aid=test",
      );

      // Verify the click was recorded in the database
      const events = await db
        .select()
        .from(affiliateEvents)
        .where(
          and(
            eq(affiliateEvents.userId, testUser.id),
            eq(affiliateEvents.tripId, trip.id),
            eq(affiliateEvents.eventType, "click"),
          ),
        );
      expect(events).toHaveLength(1);
      expect(events[0].partnerSlug).toBe("booking-com");
      expect(events[0].suggestionType).toBe("hotels");
    });

    it("should return 401 without auth", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/affiliate/click",
        payload: {
          partnerSlug: "booking-com",
          tripId: "550e8400-e29b-41d4-a716-446655440000",
          suggestionType: "hotels",
          affiliateUrl: "https://www.booking.com/searchresults.html?aid=test",
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /api/trips/:tripId/suggestions/impressions", () => {
    it("should batch log impression events and return success", async () => {
      app = await buildApp();
      const { testUser, trip } = await createTestTripWithMember();

      const token = app.jwt.sign({
        sub: testUser.id,
        name: testUser.displayName,
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/trips/${trip.id}/suggestions/impressions`,
        cookies: { auth_token: token },
        payload: {
          impressions: [
            { partnerSlug: "booking-com", suggestionType: "hotels" },
            { partnerSlug: "booking-com", suggestionType: "flights" },
          ],
        },
      });

      expect(response.statusCode).toBe(204);

      // Verify impression records in the database
      const events = await db
        .select()
        .from(affiliateEvents)
        .where(
          and(
            eq(affiliateEvents.userId, testUser.id),
            eq(affiliateEvents.tripId, trip.id),
            eq(affiliateEvents.eventType, "impression"),
          ),
        );
      expect(events).toHaveLength(2);
      expect(events.map((e) => e.suggestionType).sort()).toEqual([
        "flights",
        "hotels",
      ]);
    });

    it("should return 401 without auth", async () => {
      app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/api/trips/550e8400-e29b-41d4-a716-446655440000/suggestions/impressions",
        payload: {
          impressions: [
            { partnerSlug: "booking-com", suggestionType: "hotels" },
          ],
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
