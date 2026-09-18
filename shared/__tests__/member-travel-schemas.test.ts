// Tests for member travel validation schemas

import { describe, it, expect } from "vitest";
import {
  createMemberTravelSchema,
  updateMemberTravelSchema,
} from "../schemas/index.js";

describe("createMemberTravelSchema", () => {
  it("should accept valid member travel data with pertinent time", () => {
    const validMemberTravels = [
      {
        travelType: "arrival" as const,
        arrivalTime: "2026-07-15T10:30:00Z",
      },
      {
        travelType: "departure" as const,
        departureTime: "2026-07-20T15:45:00Z",
      },
      {
        travelType: "arrival" as const,
        arrivalTime: "2026-07-15T10:30:00Z",
        arrivalLocation: "Miami International Airport",
      },
      {
        travelType: "departure" as const,
        departureTime: "2026-07-20T15:45:00Z",
        departureLocation: "MIA Terminal 3",
        details: "Flight AA123 to New York",
      },
    ];

    validMemberTravels.forEach((memberTravel) => {
      expect(() => createMemberTravelSchema.parse(memberTravel)).not.toThrow();
    });
  });

  it("should accept full flight data (both sides + flight number)", () => {
    const memberTravel = {
      travelType: "arrival" as const,
      arrivalTime: "2026-07-15T10:30:00Z",
      arrivalLocation: "San Francisco International Airport (SFO)",
      departureTime: "2026-07-15T07:00:00Z",
      departureLocation: "JFK Airport",
      flightNumber: "UA123",
      details:
        "United Airlines Flight 789, arrives at Terminal 3. Need pickup at baggage claim area.",
    };

    expect(() => createMemberTravelSchema.parse(memberTravel)).not.toThrow();
  });

  it("should reject missing pertinent time", () => {
    const invalidMemberTravels = [
      { arrivalTime: "2026-07-15T10:30:00Z" }, // Missing travelType
      { travelType: "arrival" }, // Missing arrivalTime
      { travelType: "departure" }, // Missing departureTime
      { travelType: "arrival", departureTime: "2026-07-20T15:45:00Z" }, // Wrong side only
      { travelType: "departure", arrivalTime: "2026-07-15T10:30:00Z" }, // Wrong side only
      {}, // Missing all required fields
    ];

    invalidMemberTravels.forEach((memberTravel) => {
      const result = createMemberTravelSchema.safeParse(memberTravel);
      expect(result.success).toBe(false);
    });
  });

  it("should reject legacy time/location fields", () => {
    const memberTravel = {
      // oxlint-disable-next-line no-explicit-any
      travelType: "arrival" as const,
      time: "2026-07-15T10:30:00Z",
      location: "Miami International Airport",
    };

    const parsed = createMemberTravelSchema.safeParse(memberTravel);
    // Legacy fields are stripped and pertinent time is missing → invalid
    expect(parsed.success).toBe(false);
  });

  it("should reject invalid travel types", () => {
    const invalidTravelTypes = [
      "invalid",
      "arriving",
      "departing",
      "ARRIVAL",
      "DEPARTURE",
      "",
    ];

    invalidTravelTypes.forEach((travelType) => {
      const memberTravel = {
        travelType,
        arrivalTime: "2026-07-15T10:30:00Z",
      };

      const result = createMemberTravelSchema.safeParse(memberTravel);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "Travel type must be one of: arrival, departure",
        );
      }
    });
  });

  it("should accept valid travel types", () => {
    expect(() =>
      createMemberTravelSchema.parse({
        travelType: "arrival" as const,
        arrivalTime: "2026-07-15T10:30:00Z",
      }),
    ).not.toThrow();
    expect(() =>
      createMemberTravelSchema.parse({
        travelType: "departure" as const,
        departureTime: "2026-07-20T15:45:00Z",
      }),
    ).not.toThrow();
  });

  it("should reject invalid datetime formats", () => {
    const invalidDatetimes = [
      "2026-07-15", // Date only
      "2026-07-15T10:30:00", // Missing timezone
      "2026/07/15T10:30:00Z", // Wrong date separator
      "July 15, 2026 10:30 AM", // Wrong format
      "not-a-datetime", // Invalid format
    ];

    invalidDatetimes.forEach((arrivalTime) => {
      const memberTravel = {
        travelType: "arrival" as const,
        arrivalTime,
      };

      const result = createMemberTravelSchema.safeParse(memberTravel);
      expect(result.success).toBe(false);
    });
  });

  it("should accept valid ISO 8601 datetime strings", () => {
    const validDatetimes = [
      "2026-07-15T10:30:00Z",
      "2026-07-15T10:30:00.123Z",
      "2026-12-31T23:59:59Z",
    ];

    validDatetimes.forEach((arrivalTime) => {
      const memberTravel = {
        travelType: "arrival" as const,
        arrivalTime,
      };

      expect(() => createMemberTravelSchema.parse(memberTravel)).not.toThrow();
    });
  });

  it("should reject details that exceed max length", () => {
    const longDetails = "a".repeat(501);
    const memberTravel = {
      travelType: "arrival" as const,
      arrivalTime: "2026-07-15T10:30:00Z",
      details: longDetails,
    };

    const result = createMemberTravelSchema.safeParse(memberTravel);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "not exceed 500 characters",
      );
    }
  });

  it("should accept details at max length", () => {
    const maxDetails = "a".repeat(500);
    const memberTravel = {
      travelType: "arrival" as const,
      arrivalTime: "2026-07-15T10:30:00Z",
      details: maxDetails,
    };

    expect(() => createMemberTravelSchema.parse(memberTravel)).not.toThrow();
  });

  it("should accept empty details", () => {
    const memberTravel = {
      travelType: "arrival" as const,
      arrivalTime: "2026-07-15T10:30:00Z",
      details: "",
    };

    expect(() => createMemberTravelSchema.parse(memberTravel)).not.toThrow();
  });

  it("should accept valid create data with memberId (UUID)", () => {
    const memberTravel = {
      travelType: "arrival" as const,
      arrivalTime: "2026-07-15T10:30:00Z",
      memberId: "550e8400-e29b-41d4-a716-446655440000",
    };

    expect(() => createMemberTravelSchema.parse(memberTravel)).not.toThrow();
    const parsed = createMemberTravelSchema.parse(memberTravel);
    expect(parsed.memberId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("should accept valid create data without memberId (backward compatibility)", () => {
    const memberTravel = {
      travelType: "departure" as const,
      departureTime: "2026-07-20T15:45:00Z",
      departureLocation: "Airport",
    };

    const parsed = createMemberTravelSchema.parse(memberTravel);
    expect(parsed.memberId).toBeUndefined();
  });

  it("should reject invalid memberId format (non-UUID string)", () => {
    const invalidMemberIds = [
      "not-a-uuid",
      "12345",
      "",
      "550e8400-e29b-41d4-a716",
    ];

    invalidMemberIds.forEach((memberId) => {
      const memberTravel = {
        travelType: "arrival" as const,
        arrivalTime: "2026-07-15T10:30:00Z",
        memberId,
      };

      const result = createMemberTravelSchema.safeParse(memberTravel);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "Invalid member ID format",
        );
      }
    });
  });
});

describe("updateMemberTravelSchema", () => {
  it("should accept partial updates with any single field", () => {
    const partialUpdates = [
      { travelType: "departure" as const },
      { arrivalTime: "2026-08-01T12:00:00Z" },
      { departureTime: "2026-08-01T12:00:00Z" },
      { arrivalLocation: "New Airport" },
      { departureLocation: "New Airport" },
      { details: "Updated flight information" },
    ];

    partialUpdates.forEach((update) => {
      expect(() => updateMemberTravelSchema.parse(update)).not.toThrow();
    });
  });

  it("should accept partial updates with multiple fields", () => {
    const update = {
      travelType: "arrival" as const,
      arrivalTime: "2026-08-15T09:00:00Z",
      arrivalLocation: "Updated Airport",
      details: "New flight details",
    };

    expect(() => updateMemberTravelSchema.parse(update)).not.toThrow();
  });

  it("should accept empty object (no updates)", () => {
    expect(() => updateMemberTravelSchema.parse({})).not.toThrow();
  });

  it("should still validate field constraints when provided", () => {
    const invalidUpdates = [
      { travelType: "invalid" }, // Invalid enum
      { arrivalTime: "not-a-datetime" }, // Invalid datetime format
      { departureTime: "2026-07-15" }, // Date only, missing time
      { details: "a".repeat(501) }, // Too long
    ];

    invalidUpdates.forEach((update) => {
      const result = updateMemberTravelSchema.safeParse(update);
      expect(result.success).toBe(false);
    });
  });

  it("should validate details length when provided", () => {
    const validUpdate = {
      details: "a".repeat(500),
    };

    expect(() => updateMemberTravelSchema.parse(validUpdate)).not.toThrow();

    const invalidUpdate = {
      details: "a".repeat(501),
    };

    const result = updateMemberTravelSchema.safeParse(invalidUpdate);
    expect(result.success).toBe(false);
  });

  it("should validate travelType enum when provided", () => {
    const validUpdate = {
      travelType: "arrival" as const,
    };

    expect(() => updateMemberTravelSchema.parse(validUpdate)).not.toThrow();

    const invalidUpdate = {
      travelType: "invalid",
    };

    const result = updateMemberTravelSchema.safeParse(invalidUpdate);
    expect(result.success).toBe(false);
  });

  it("should validate time format when provided", () => {
    const validUpdate = {
      arrivalTime: "2026-07-15T10:30:00Z",
    };

    expect(() => updateMemberTravelSchema.parse(validUpdate)).not.toThrow();

    const invalidUpdate = {
      arrivalTime: "2026-07-15",
    };

    const result = updateMemberTravelSchema.safeParse(invalidUpdate);
    expect(result.success).toBe(false);
  });
});
