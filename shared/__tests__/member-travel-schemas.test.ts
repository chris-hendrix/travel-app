// Tests for member travel validation schemas

import { describe, it, expect } from "vitest";
import {
  createMemberTravelSchema,
  updateMemberTravelSchema,
  memberTravelResponseSchema,
} from "../schemas/index.js";

describe("createMemberTravelSchema", () => {
  it("should accept valid member travel data with all required fields", () => {
    const validMemberTravels = [
      {
        travelType: "arrival" as const,
        time: "2026-07-15T10:30:00Z",
      },
      {
        travelType: "departure" as const,
        time: "2026-07-20T15:45:00Z",
      },
      {
        travelType: "arrival" as const,
        time: "2026-07-15T10:30:00Z",
        location: "Miami International Airport",
      },
      {
        travelType: "departure" as const,
        time: "2026-07-20T15:45:00Z",
        location: "MIA Terminal 3",
        details: "Flight AA123 to New York",
      },
    ];

    validMemberTravels.forEach((memberTravel) => {
      expect(() => createMemberTravelSchema.parse(memberTravel)).not.toThrow();
    });
  });

  it("should accept member travel with all optional fields", () => {
    const memberTravel = {
      travelType: "arrival" as const,
      time: "2026-07-15T10:30:00Z",
      location: "San Francisco International Airport (SFO)",
      details:
        "United Airlines Flight 789, arrives at Terminal 3. Need pickup at baggage claim area.",
    };

    expect(() => createMemberTravelSchema.parse(memberTravel)).not.toThrow();
  });

  it("should reject missing required fields", () => {
    const invalidMemberTravels = [
      { time: "2026-07-15T10:30:00Z" }, // Missing travelType
      { travelType: "arrival" }, // Missing time
      {}, // Missing all required fields
    ];

    invalidMemberTravels.forEach((memberTravel) => {
      const result = createMemberTravelSchema.safeParse(memberTravel);
      expect(result.success).toBe(false);
    });
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
        time: "2026-07-15T10:30:00Z",
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
    const validTravelTypes: Array<"arrival" | "departure"> = [
      "arrival",
      "departure",
    ];

    validTravelTypes.forEach((travelType) => {
      const memberTravel = {
        travelType,
        time: "2026-07-15T10:30:00Z",
      };

      expect(() => createMemberTravelSchema.parse(memberTravel)).not.toThrow();
    });
  });

  it("should reject invalid datetime formats for time", () => {
    const invalidDatetimes = [
      "2026-07-15", // Date only
      "2026-07-15T10:30:00", // Missing timezone
      "2026/07/15T10:30:00Z", // Wrong date separator
      "July 15, 2026 10:30 AM", // Wrong format
      "not-a-datetime", // Invalid format
    ];

    invalidDatetimes.forEach((time) => {
      const memberTravel = {
        travelType: "arrival" as const,
        time,
      };

      const result = createMemberTravelSchema.safeParse(memberTravel);
      expect(result.success).toBe(false);
    });
  });

  it("should accept valid ISO 8601 datetime strings for time", () => {
    const validDatetimes = [
      "2026-07-15T10:30:00Z",
      "2026-07-15T10:30:00.123Z",
      "2026-12-31T23:59:59Z",
    ];

    validDatetimes.forEach((time) => {
      const memberTravel = {
        travelType: "arrival" as const,
        time,
      };

      expect(() => createMemberTravelSchema.parse(memberTravel)).not.toThrow();
    });
  });

  it("should reject details that exceed max length", () => {
    const longDetails = "a".repeat(501);
    const memberTravel = {
      travelType: "arrival" as const,
      time: "2026-07-15T10:30:00Z",
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
      time: "2026-07-15T10:30:00Z",
      details: maxDetails,
    };

    expect(() => createMemberTravelSchema.parse(memberTravel)).not.toThrow();
  });

  it("should accept empty details", () => {
    const memberTravel = {
      travelType: "arrival" as const,
      time: "2026-07-15T10:30:00Z",
      details: "",
    };

    expect(() => createMemberTravelSchema.parse(memberTravel)).not.toThrow();
  });

  it("should accept member travel without optional fields", () => {
    const memberTravel = {
      travelType: "departure" as const,
      time: "2026-07-20T15:45:00Z",
    };

    expect(() => createMemberTravelSchema.parse(memberTravel)).not.toThrow();
  });

  it("should accept valid create data with memberId (UUID)", () => {
    const memberTravel = {
      travelType: "arrival" as const,
      time: "2026-07-15T10:30:00Z",
      memberId: "550e8400-e29b-41d4-a716-446655440000",
    };

    expect(() => createMemberTravelSchema.parse(memberTravel)).not.toThrow();
    const parsed = createMemberTravelSchema.parse(memberTravel);
    expect(parsed.memberId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("should accept valid create data without memberId (backward compatibility)", () => {
    const memberTravel = {
      travelType: "departure" as const,
      time: "2026-07-20T15:45:00Z",
      location: "Airport",
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
        time: "2026-07-15T10:30:00Z",
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
      { time: "2026-08-01T12:00:00Z" },
      { location: "New Airport" },
      { details: "Updated flight information" },
    ];

    partialUpdates.forEach((update) => {
      expect(() => updateMemberTravelSchema.parse(update)).not.toThrow();
    });
  });

  it("should accept partial updates with multiple fields", () => {
    const update = {
      travelType: "arrival" as const,
      time: "2026-08-15T09:00:00Z",
      location: "Updated Airport",
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
      { time: "not-a-datetime" }, // Invalid datetime format
      { time: "2026-07-15" }, // Date only, missing time
      { details: "a".repeat(501) }, // Too long
    ];

    invalidUpdates.forEach((update) => {
      const result = updateMemberTravelSchema.safeParse(update);
      expect(result.success).toBe(false);
    });
  });

  it("should accept valid partial update with travelType only", () => {
    const update = {
      travelType: "departure" as const,
    };

    expect(() => updateMemberTravelSchema.parse(update)).not.toThrow();
  });

  it("should accept valid partial update with time only", () => {
    const update = {
      time: "2026-08-01T14:30:00Z",
    };

    expect(() => updateMemberTravelSchema.parse(update)).not.toThrow();
  });

  it("should accept valid partial update with location only", () => {
    const update = {
      location: "JFK International Airport",
    };

    expect(() => updateMemberTravelSchema.parse(update)).not.toThrow();
  });

  it("should accept valid partial update with details only", () => {
    const update = {
      details: "Changed to earlier flight",
    };

    expect(() => updateMemberTravelSchema.parse(update)).not.toThrow();
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
      time: "2026-07-15T10:30:00Z",
    };

    expect(() => updateMemberTravelSchema.parse(validUpdate)).not.toThrow();

    const invalidUpdate = {
      time: "2026-07-15",
    };

    const result = updateMemberTravelSchema.safeParse(invalidUpdate);
    expect(result.success).toBe(false);
  });
});

describe("memberTravelEntitySchema (via memberTravelResponseSchema)", () => {
  const baseMemberTravel = {
    id: "travel-1",
    tripId: "trip-1",
    memberId: "550e8400-e29b-41d4-a716-446655440000",
    travelType: "arrival" as const,
    time: new Date("2026-07-15T10:30:00Z"),
    location: null,
    details: null,
    flightNumber: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-07-15T10:00:00Z"),
    updatedAt: new Date("2026-07-15T10:00:00Z"),
    memberName: "Alice",
  };

  it("should accept a member travel with a null userId (placeholder)", () => {
    expect(() =>
      memberTravelResponseSchema.parse({
        success: true,
        memberTravel: { ...baseMemberTravel, userId: null },
      }),
    ).not.toThrow();
  });

  it("should accept a member travel with a non-null userId", () => {
    expect(() =>
      memberTravelResponseSchema.parse({
        success: true,
        memberTravel: {
          ...baseMemberTravel,
          userId: "550e8400-e29b-41d4-a716-446655440001",
        },
      }),
    ).not.toThrow();
  });

  it("should reject a member travel missing userId", () => {
    const result = memberTravelResponseSchema.safeParse({
      success: true,
      memberTravel: baseMemberTravel,
    });
    expect(result.success).toBe(false);
  });
});
