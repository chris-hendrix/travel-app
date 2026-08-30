// Tests for placeholder member validation schemas

import { describe, it, expect } from "vitest";
import {
  createPlaceholderSchema,
  updatePlaceholderSchema,
} from "../schemas/index.js";

describe("createPlaceholderSchema", () => {
  it("should accept a valid name with no phone number", () => {
    const input = { name: "Alex Johnson" };
    const parsed = createPlaceholderSchema.parse(input);
    expect(parsed.name).toBe("Alex Johnson");
    expect(parsed.phoneNumber).toBeUndefined();
  });

  it("should accept a valid name with an E.164 phone number", () => {
    const input = { name: "Alex Johnson", phoneNumber: "+14155552671" };
    const parsed = createPlaceholderSchema.parse(input);
    expect(parsed.name).toBe("Alex Johnson");
    expect(parsed.phoneNumber).toBe("+14155552671");
  });

  it("should accept a name at the maximum length (100 chars)", () => {
    const input = { name: "a".repeat(100) };
    expect(() => createPlaceholderSchema.parse(input)).not.toThrow();
  });

  it("should accept a single-character name", () => {
    const input = { name: "A" };
    expect(() => createPlaceholderSchema.parse(input)).not.toThrow();
  });

  it("should reject a missing name", () => {
    const result = createPlaceholderSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should reject an empty name", () => {
    const result = createPlaceholderSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Placeholder name must be at least 1 character",
      );
    }
  });

  it("should reject a name that exceeds 100 characters", () => {
    const result = createPlaceholderSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Placeholder name must not exceed 100 characters",
      );
    }
  });

  it("should reject a non-string name", () => {
    const invalidNames = [123, null, true, {}];

    invalidNames.forEach((name) => {
      const result = createPlaceholderSchema.safeParse({ name });
      expect(result.success).toBe(false);
    });
  });

  it("should reject a non-E.164 phone number", () => {
    const invalidPhones = [
      "4155552671", // Missing + prefix
      "+1", // Too short
      "+123456789012345678", // Too long
      "not-a-phone",
      "",
    ];

    invalidPhones.forEach((phoneNumber) => {
      const result = createPlaceholderSchema.safeParse({
        name: "Alex",
        phoneNumber,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("E.164 format");
      }
    });
  });

  it("should strip control characters from the name", () => {
    const input = { name: "Alex\u0000 Johnson\u0007" };
    const parsed = createPlaceholderSchema.parse(input);
    expect(parsed.name).toBe("Alex Johnson");
  });
});

describe("updatePlaceholderSchema", () => {
  it("should accept an empty object (no updates)", () => {
    expect(() => updatePlaceholderSchema.parse({})).not.toThrow();
  });

  it("should accept a name-only update", () => {
    const parsed = updatePlaceholderSchema.parse({ name: "New Name" });
    expect(parsed.name).toBe("New Name");
    expect(parsed.phoneNumber).toBeUndefined();
  });

  it("should accept a phone-number-only update", () => {
    const parsed = updatePlaceholderSchema.parse({ phoneNumber: "+14155552671" });
    expect(parsed.phoneNumber).toBe("+14155552671");
    expect(parsed.name).toBeUndefined();
  });

  it("should accept both name and phone number", () => {
    const parsed = updatePlaceholderSchema.parse({
      name: "Updated",
      phoneNumber: "+442071838750",
    });
    expect(parsed.name).toBe("Updated");
    expect(parsed.phoneNumber).toBe("+442071838750");
  });

  it("should reject an empty name when provided", () => {
    const result = updatePlaceholderSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("should reject a name that exceeds 100 characters", () => {
    const result = updatePlaceholderSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("should reject a non-E.164 phone number", () => {
    const result = updatePlaceholderSchema.safeParse({ phoneNumber: "not-a-phone" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("E.164 format");
    }
  });

  it("should accept null phoneNumber to clear it", () => {
    const parsed = updatePlaceholderSchema.parse({ phoneNumber: null });
    expect(parsed.phoneNumber).toBeNull();
  });
});
