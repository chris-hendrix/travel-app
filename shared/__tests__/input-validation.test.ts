// Tests for .max() input length validation constraints

import { describe, it, expect } from "vitest";
import {
  getMutualsQuerySchema,
  getMutualSuggestionsQuerySchema,
  createTripSchema,
  createEventSchema,
  createAccommodationSchema,
  createMemberTravelSchema,
  completeProfileSchema,
  updateProfileSchema,
} from "../schemas/index.js";

describe("input length validation", () => {
  describe("mutuals cursor (.max(500))", () => {
    it("should accept a cursor at max length (500)", () => {
      const cursor = "a".repeat(500);
      const result = getMutualsQuerySchema.safeParse({ cursor });
      expect(result.success).toBe(true);
    });

    it("should reject a cursor exceeding max length", () => {
      const cursor = "a".repeat(501);
      const result = getMutualsQuerySchema.safeParse({ cursor });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes("cursor"),
        );
        expect(issue).toBeDefined();
      }
    });

    it("should accept a suggestions cursor at max length (500)", () => {
      const cursor = "a".repeat(500);
      const result = getMutualSuggestionsQuerySchema.safeParse({ cursor });
      expect(result.success).toBe(true);
    });

    it("should reject a suggestions cursor exceeding max length", () => {
      const cursor = "a".repeat(501);
      const result = getMutualSuggestionsQuerySchema.safeParse({ cursor });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes("cursor"),
        );
        expect(issue).toBeDefined();
      }
    });
  });

  describe("trip destination (.max(255))", () => {
    const validTrip = {
      name: "Test Trip",
      destination: "Paris",
      timezone: "UTC",
    };

    it("should accept a destination at max length (255)", () => {
      const result = createTripSchema.safeParse({
        ...validTrip,
        destination: "a".repeat(255),
      });
      expect(result.success).toBe(true);
    });

    it("should reject a destination exceeding max length", () => {
      const result = createTripSchema.safeParse({
        ...validTrip,
        destination: "a".repeat(256),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes("destination"),
        );
        expect(issue).toBeDefined();
        expect(issue!.message).toContain("255");
      }
    });
  });

  describe("trip coverImageUrl (.max(2048))", () => {
    const validTrip = {
      name: "Test Trip",
      destination: "Paris",
      timezone: "UTC",
    };

    it("should accept a coverImageUrl at max length (2048)", () => {
      const url = "https://example.com/" + "a".repeat(2028);
      expect(url.length).toBe(2048);
      const result = createTripSchema.safeParse({
        ...validTrip,
        coverImageUrl: url,
      });
      expect(result.success).toBe(true);
    });

    it("should reject a coverImageUrl exceeding max length", () => {
      const url = "https://example.com/" + "a".repeat(2029);
      expect(url.length).toBe(2049);
      const result = createTripSchema.safeParse({
        ...validTrip,
        coverImageUrl: url,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes("coverImageUrl"),
        );
        expect(issue).toBeDefined();
        expect(issue!.message).toContain("2048");
      }
    });
  });

  describe("event location (.max(500))", () => {
    const validEvent = {
      name: "Dinner",
      eventType: "meal" as const,
      startTime: "2026-03-01T18:00:00Z",
    };

    it("should accept a location at max length (500)", () => {
      const result = createEventSchema.safeParse({
        ...validEvent,
        location: "a".repeat(500),
      });
      expect(result.success).toBe(true);
    });

    it("should reject a location exceeding max length", () => {
      const result = createEventSchema.safeParse({
        ...validEvent,
        location: "a".repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes("location"),
        );
        expect(issue).toBeDefined();
      }
    });
  });

  describe("event timezone (.max(100))", () => {
    const validEvent = {
      name: "Dinner",
      eventType: "meal" as const,
      startTime: "2026-03-01T18:00:00Z",
    };

    it("should accept a timezone at max length (100)", () => {
      const result = createEventSchema.safeParse({
        ...validEvent,
        timezone: "a".repeat(100),
      });
      expect(result.success).toBe(true);
    });

    it("should reject a timezone exceeding max length", () => {
      const result = createEventSchema.safeParse({
        ...validEvent,
        timezone: "a".repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes("timezone"),
        );
        expect(issue).toBeDefined();
      }
    });
  });

  describe("accommodation address (.max(500))", () => {
    const validAccommodation = {
      name: "Hotel California",
      checkIn: "2026-03-01T15:00:00Z",
      checkOut: "2026-03-05T11:00:00Z",
    };

    it("should accept an address at max length (500)", () => {
      const result = createAccommodationSchema.safeParse({
        ...validAccommodation,
        address: "a".repeat(500),
      });
      expect(result.success).toBe(true);
    });

    it("should reject an address exceeding max length", () => {
      const result = createAccommodationSchema.safeParse({
        ...validAccommodation,
        address: "a".repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes("address"),
        );
        expect(issue).toBeDefined();
      }
    });
  });

  describe("member-travel location (.max(500))", () => {
    const validTravel = {
      travelType: "arrival" as const,
      time: "2026-03-01T10:00:00Z",
    };

    it("should accept a location at max length (500)", () => {
      const result = createMemberTravelSchema.safeParse({
        ...validTravel,
        location: "a".repeat(500),
      });
      expect(result.success).toBe(true);
    });

    it("should reject a location exceeding max length", () => {
      const result = createMemberTravelSchema.safeParse({
        ...validTravel,
        location: "a".repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes("location"),
        );
        expect(issue).toBeDefined();
      }
    });
  });

  describe("auth timezone (.max(100))", () => {
    it("should accept a timezone at max length (100)", () => {
      const result = completeProfileSchema.safeParse({
        displayName: "Test User",
        timezone: "a".repeat(100),
      });
      expect(result.success).toBe(true);
    });

    it("should reject a timezone exceeding max length", () => {
      const result = completeProfileSchema.safeParse({
        displayName: "Test User",
        timezone: "a".repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes("timezone"),
        );
        expect(issue).toBeDefined();
      }
    });
  });

  describe("user profile timezone (.max(100))", () => {
    it("should accept a timezone at max length (100)", () => {
      const result = updateProfileSchema.safeParse({
        timezone: "a".repeat(100),
      });
      expect(result.success).toBe(true);
    });

    it("should reject a timezone exceeding max length", () => {
      const result = updateProfileSchema.safeParse({
        timezone: "a".repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes("timezone"),
        );
        expect(issue).toBeDefined();
      }
    });
  });
});
