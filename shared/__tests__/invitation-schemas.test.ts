// Tests for invitation validation schemas

import { describe, it, expect } from "vitest";
import {
  createInvitationsSchema,
  updateRsvpSchema,
  updateMySettingsSchema,
  mySettingsResponseSchema,
} from "../schemas/index.js";

describe("createInvitationsSchema", () => {
  it("should accept phone-only invitations", () => {
    const input = { phoneNumbers: ["+14155552671"] };
    const parsed = createInvitationsSchema.parse(input);
    expect(parsed.phoneNumbers).toHaveLength(1);
    expect(parsed.userIds).toEqual([]);
  });

  it("should accept userId-only invitations", () => {
    const input = { userIds: ["550e8400-e29b-41d4-a716-446655440000"] };
    const parsed = createInvitationsSchema.parse(input);
    expect(parsed.userIds).toHaveLength(1);
    expect(parsed.phoneNumbers).toEqual([]);
  });

  it("should accept mixed phone and userId invitations", () => {
    const input = {
      phoneNumbers: ["+14155552671"],
      userIds: ["550e8400-e29b-41d4-a716-446655440000"],
    };
    const parsed = createInvitationsSchema.parse(input);
    expect(parsed.phoneNumbers).toHaveLength(1);
    expect(parsed.userIds).toHaveLength(1);
  });

  it("should reject when both arrays are empty", () => {
    const input = { phoneNumbers: [], userIds: [] };
    const result = createInvitationsSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "At least one phone number or user ID is required",
      );
      expect(result.error.issues[0]?.path).toContain("phoneNumbers");
    }
  });

  it("should reject when neither field is provided (defaults both to [])", () => {
    const result = createInvitationsSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "At least one phone number or user ID is required",
      );
      expect(result.error.issues[0]?.path).toContain("phoneNumbers");
    }
  });

  it("should reject more than 25 phone numbers", () => {
    const phoneNumbers = Array(26)
      .fill(null)
      .map((_, i) => `+1415555${String(i).padStart(4, "0")}`);
    const input = { phoneNumbers };
    const result = createInvitationsSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Cannot invite more than 25 members at once",
      );
    }
  });

  it("should reject more than 25 userIds", () => {
    const userIds = Array(26)
      .fill(null)
      .map(() => "550e8400-e29b-41d4-a716-446655440000");
    const input = { userIds };
    const result = createInvitationsSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Cannot invite more than 25 members at once",
      );
    }
  });

  it("should reject invalid phone numbers in phoneNumbers array", () => {
    const invalidPhones = [
      "not-a-phone", // Not a phone number at all
      "4155552671", // Missing + prefix
      "+1", // Too short
      "+123456789012345678", // Too long (more than 15 digits after +)
      "+1abc5552671", // Contains letters
    ];

    invalidPhones.forEach((phone) => {
      const input = { phoneNumbers: [phone] };
      const result = createInvitationsSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("E.164 format");
      }
    });
  });

  it("should reject invalid UUID in userIds", () => {
    const input = { userIds: ["not-a-uuid"] };
    const result = createInvitationsSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Each user ID must be a valid UUID",
      );
    }
  });

  it("should reject non-array phoneNumbers", () => {
    const invalidInputs = [
      { phoneNumbers: "+14155552671" }, // String instead of array
      { phoneNumbers: 12345 }, // Number
      { phoneNumbers: null }, // Null
    ];

    invalidInputs.forEach((input) => {
      const result = createInvitationsSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  it("should accept at maximum boundary: 25 phone numbers", () => {
    const phoneNumbers = Array(25)
      .fill(null)
      .map((_, i) => `+1415555${String(i).padStart(4, "0")}`);
    const input = { phoneNumbers };
    const parsed = createInvitationsSchema.parse(input);
    expect(parsed.phoneNumbers).toHaveLength(25);
  });

  it("should accept at maximum boundary: 25 userIds", () => {
    const userIds = Array(25)
      .fill(null)
      .map(() => "550e8400-e29b-41d4-a716-446655440000");
    const input = { userIds };
    const parsed = createInvitationsSchema.parse(input);
    expect(parsed.userIds).toHaveLength(25);
  });

  it("should default userIds to [] when only phoneNumbers provided", () => {
    const input = { phoneNumbers: ["+14155552671"] };
    const parsed = createInvitationsSchema.parse(input);
    expect(parsed.userIds).toEqual([]);
  });

  it("should default phoneNumbers to [] when only userIds provided", () => {
    const input = { userIds: ["550e8400-e29b-41d4-a716-446655440000"] };
    const parsed = createInvitationsSchema.parse(input);
    expect(parsed.phoneNumbers).toEqual([]);
  });
});

describe("updateRsvpSchema", () => {
  it("should accept all valid statuses", () => {
    const validStatuses: Array<"going" | "not_going" | "maybe"> = [
      "going",
      "not_going",
      "maybe",
    ];

    validStatuses.forEach((status) => {
      expect(() => updateRsvpSchema.parse({ status })).not.toThrow();
    });
  });

  it("should reject 'no_response' as it is not a valid user input", () => {
    const result = updateRsvpSchema.safeParse({ status: "no_response" });
    expect(result.success).toBe(false);
  });

  it("should reject invalid status values", () => {
    const invalidStatuses = ["", "invalid", "GOING", "attending", "yes", "no"];

    invalidStatuses.forEach((status) => {
      const result = updateRsvpSchema.safeParse({ status });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "Status must be one of: going, not_going, maybe",
        );
      }
    });
  });

  it("should reject missing status field", () => {
    const result = updateRsvpSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should provide helpful error messages", () => {
    const result = updateRsvpSchema.safeParse({ status: "invalid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Status must be one of: going, not_going, maybe",
      );
    }
  });

  it("should accept sharePhone as optional boolean", () => {
    const validInputs = [
      { status: "going", sharePhone: true },
      { status: "going", sharePhone: false },
      { status: "going" },
    ];

    validInputs.forEach((input) => {
      expect(() => updateRsvpSchema.parse(input)).not.toThrow();
    });
  });

  it("should reject non-boolean sharePhone", () => {
    const result = updateRsvpSchema.safeParse({
      status: "going",
      sharePhone: "yes",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateMySettingsSchema", () => {
  it("should accept valid boolean sharePhone values", () => {
    const validInputs = [{ sharePhone: true }, { sharePhone: false }];

    validInputs.forEach((input) => {
      expect(() => updateMySettingsSchema.parse(input)).not.toThrow();
    });
  });

  it("should reject missing sharePhone field", () => {
    const result = updateMySettingsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should reject non-boolean sharePhone values", () => {
    const invalidValues = ["true", null, 1];

    invalidValues.forEach((value) => {
      const result = updateMySettingsSchema.safeParse({ sharePhone: value });
      expect(result.success).toBe(false);
    });
  });
});

describe("mySettingsResponseSchema", () => {
  it("should accept valid settings response", () => {
    const validResponses = [
      { success: true, sharePhone: true, calendarExcluded: false },
      { success: true, sharePhone: false, calendarExcluded: true },
    ];

    validResponses.forEach((response) => {
      expect(() => mySettingsResponseSchema.parse(response)).not.toThrow();
    });
  });

  it("should reject success: false", () => {
    const result = mySettingsResponseSchema.safeParse({
      success: false,
      sharePhone: true,
      calendarExcluded: false,
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing success field", () => {
    const result = mySettingsResponseSchema.safeParse({
      sharePhone: true,
      calendarExcluded: false,
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing sharePhone field", () => {
    const result = mySettingsResponseSchema.safeParse({
      success: true,
      calendarExcluded: false,
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing calendarExcluded field", () => {
    const result = mySettingsResponseSchema.safeParse({
      success: true,
      sharePhone: true,
    });
    expect(result.success).toBe(false);
  });
});
