// Tests for member travel validation schemas

import { describe, it, expect } from "vitest";
import {
  createMemberTravelSchema,
  updateMemberTravelSchema,
  memberTravelResponseSchema,
} from "../schemas/index.js";
import { TRANSPORT_MODES } from "../utils/travel.js";

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

  it("should trim the four clearable text fields", () => {
    // A where that is only whitespace is the empty where the member meant
    // rather than a distinct value the suggestion list would offer back —
    // and the rest of the field is their own words, whose edges are not
    // part of the answer.
    const parsed = createMemberTravelSchema.parse({
      travelType: "arrival" as const,
      arrivalTime: "2026-07-15T10:30:00Z",
      arrivalLocation: "  BCN T2  ",
      departureLocation: "   ",
      details: "  Bags take twenty minutes.  ",
      flightNumber: "  IB 3453  ",
    });

    expect(parsed.arrivalLocation).toBe("BCN T2");
    expect(parsed.departureLocation).toBe("");
    expect(parsed.details).toBe("Bags take twenty minutes.");
    expect(parsed.flightNumber).toBe("IB 3453");
  });

  it("should not count trailing space against a location's length", () => {
    const parsed = createMemberTravelSchema.parse({
      travelType: "arrival" as const,
      arrivalTime: "2026-07-15T10:30:00Z",
      arrivalLocation: `${"x".repeat(500)}${" ".repeat(20)}`,
    });

    expect(parsed.arrivalLocation).toBe("x".repeat(500));
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

  it("files no mode of its own when the body carries none", () => {
    // The column's own default is the only default. A schema that filled
    // `flight` here would turn every mode-less write into a statement
    // about the mode, which is the reset the pair-update branch would
    // then commit.
    const parsed = createMemberTravelSchema.parse({
      travelType: "arrival" as const,
      arrivalTime: "2026-07-15T10:30:00Z",
    });

    expect("transportMode" in parsed).toBe(false);
    expect(parsed.transportMode).toBeUndefined();
  });

  it("accepts each of the six modes", () => {
    for (const mode of TRANSPORT_MODES) {
      const parsed = createMemberTravelSchema.parse({
        travelType: "arrival" as const,
        arrivalTime: "2026-07-15T10:30:00Z",
        transportMode: mode,
      });

      expect(parsed.transportMode).toBe(mode);
    }
  });

  it("refuses a mode that is not one of the six, by name", () => {
    const invalidModes = ["ferry", "FLIGHT", "", "journey", null];

    invalidModes.forEach((transportMode) => {
      const result = createMemberTravelSchema.safeParse({
        travelType: "arrival" as const,
        arrivalTime: "2026-07-15T10:30:00Z",
        transportMode,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "Transport mode must be one of: flight, train, bus, car, rental, other",
        );
      }
    });
  });
});

describe("TRANSPORT_MODES", () => {
  it("is the six the feature names, in the order the chips read", () => {
    // One declaration with its consumers on both sides: the request and
    // entity schemas build their enums from this array, the API's own
    // column does too, and the mobile's label table is keyed by it — so
    // this order is the order the chips offer.
    expect(TRANSPORT_MODES).toEqual([
      "flight",
      "train",
      "bus",
      "car",
      "rental",
      "other",
    ]);
  });
});

describe("updateMemberTravelSchema", () => {
  it("should accept partial updates with any single field", () => {
    const partialUpdates = [
      { arrivalTime: "2026-08-01T12:00:00Z" },
      { departureTime: "2026-08-01T12:00:00Z" },
      { arrivalLocation: "New Airport" },
      { departureLocation: "New Airport" },
      { details: "Updated flight information" },
      { flightNumber: "IB 3453" },
    ];

    partialUpdates.forEach((update) => {
      expect(() => updateMemberTravelSchema.parse(update)).not.toThrow();
    });
  });

  it("should accept partial updates with multiple fields", () => {
    const update = {
      arrivalTime: "2026-08-15T09:00:00Z",
      arrivalLocation: "Updated Airport",
      details: "New flight details",
    };

    expect(() => updateMemberTravelSchema.parse(update)).not.toThrow();
  });

  it("should strip travelType rather than carry a direction change", () => {
    // The pair of member and direction is the row's identity, so the
    // direction is create-only: an update that handed the service one
    // would leave the old pair's row behind while the new one sat free
    // for the next write — a second live row for that member, from a
    // plain edit. Stripping rather than rejecting is what lets a client
    // that still sends its direction through the PUT keep its other
    // edits.
    const parsed = updateMemberTravelSchema.parse({
      travelType: "departure",
      arrivalLocation: "New Airport",
    });

    expect(parsed).toEqual({ arrivalLocation: "New Airport" });
    expect("travelType" in parsed).toBe(false);
  });

  it("should ignore an invalid travelType instead of failing the update", () => {
    // A stripped key is not validated, which is the same rule seen from
    // the other side: the direction is not this schema's business, so a
    // bad one cannot make the edit fail either.
    const parsed = updateMemberTravelSchema.safeParse({
      travelType: "sideways",
      details: "Kept",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ details: "Kept" });
  });

  it("should accept empty object (no updates)", () => {
    expect(() => updateMemberTravelSchema.parse({})).not.toThrow();
  });

  it("should still validate field constraints when provided", () => {
    const invalidUpdates = [
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

  it("carries a mode, and refuses a null one", () => {
    // Editable, unlike `travelType`: a leg that started as a flight and
    // became a train is the same leg, so the mode is a field of the edit.
    // It stays non-nullable all the same — the column is NOT NULL with a
    // default, and there is no "unknown" for a reader to carry.
    expect(
      updateMemberTravelSchema.parse({ transportMode: "rental" }),
    ).toEqual({ transportMode: "rental" });

    expect(updateMemberTravelSchema.safeParse({ transportMode: null }).success).toBe(
      false,
    );
    expect(
      updateMemberTravelSchema.safeParse({ transportMode: "ferry" }).success,
    ).toBe(false);
  });
});

describe("memberTravelResponseSchema", () => {
  it("carries the mode, which is how it reaches the client at all", () => {
    // Fastify serializes a response through this schema, so a field the
    // entity does not declare is stripped off the wire no matter what the
    // service returned. This is the whole reason the mode is declared in
    // two places rather than one.
    const parsed = memberTravelResponseSchema.parse({
      success: true as const,
      memberTravel: {
        id: "t-1",
        tripId: "trip-1",
        memberId: "m-1",
        travelType: "arrival" as const,
        transportMode: "rental" as const,
        departureLocation: null,
        departureTime: null,
        arrivalLocation: "BCN T2",
        arrivalTime: new Date("2026-07-15T10:30:00Z"),
        details: null,
        flightNumber: null,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date("2026-07-01T10:30:00Z"),
        updatedAt: new Date("2026-07-01T10:30:00Z"),
      },
    });

    expect(parsed.memberTravel.transportMode).toBe("rental");
  });
});
