// Tests for authentication validation schemas

import { describe, it, expect } from "vitest";
import {
  requestCodeSchema,
  verifyCodeSchema,
  completeProfileSchema,
} from "../schemas/index.js";

describe("requestCodeSchema", () => {
  it("should accept valid phone numbers", () => {
    const validPhoneNumbers = [
      "+14155552671", // E.164 format
      "4155552671", // 10 digits
      "+442071838750", // UK number
      "1234567890", // Exactly 10 digits
      "12345678901234567890", // Exactly 20 digits
    ];

    validPhoneNumbers.forEach((phoneNumber) => {
      expect(() =>
        requestCodeSchema.parse({ phoneNumber, smsConsent: true }),
      ).not.toThrow();
    });
  });

  it("should reject phone numbers that are too short", () => {
    const shortPhoneNumbers = [
      "123456789", // 9 digits
      "12345", // 5 digits
      "+1234", // 5 characters
      "", // Empty string
    ];

    shortPhoneNumbers.forEach((phoneNumber) => {
      const result = requestCodeSchema.safeParse({
        phoneNumber,
        smsConsent: true,
      });
      expect(result.success).toBe(false);
    });
  });

  it("should reject phone numbers that are too long", () => {
    const longPhoneNumbers = [
      "123456789012345678901", // 21 digits
      "+12345678901234567890123", // 23 characters
    ];

    longPhoneNumbers.forEach((phoneNumber) => {
      const result = requestCodeSchema.safeParse({
        phoneNumber,
        smsConsent: true,
      });
      expect(result.success).toBe(false);
    });
  });

  it("should provide helpful error messages for short phone numbers", () => {
    const result = requestCodeSchema.safeParse({
      phoneNumber: "123",
      smsConsent: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "at least 10 characters",
      );
    }
  });

  it("should provide helpful error messages for long phone numbers", () => {
    const result = requestCodeSchema.safeParse({
      phoneNumber: "123456789012345678901",
      smsConsent: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "not exceed 20 characters",
      );
    }
  });

  it("should reject missing phoneNumber field", () => {
    const result = requestCodeSchema.safeParse({ smsConsent: true });
    expect(result.success).toBe(false);
  });

  it("should reject missing smsConsent", () => {
    const result = requestCodeSchema.safeParse({
      phoneNumber: "+14155552671",
    });
    expect(result.success).toBe(false);
  });

  it("should reject smsConsent set to false", () => {
    const result = requestCodeSchema.safeParse({
      phoneNumber: "+14155552671",
      smsConsent: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("verifyCodeSchema", () => {
  it("should accept valid phone number and code combinations", () => {
    const validInputs = [
      { phoneNumber: "+14155552671", code: "123456", smsConsent: true },
      { phoneNumber: "4155552671", code: "000000", smsConsent: true },
      { phoneNumber: "+442071838750", code: "999999", smsConsent: true },
      { phoneNumber: "1234567890", code: "123456", smsConsent: true },
    ];

    validInputs.forEach((input) => {
      expect(() => verifyCodeSchema.parse(input)).not.toThrow();
    });
  });

  it("should reject codes that are not exactly 6 digits", () => {
    const invalidCodes = [
      { phoneNumber: "1234567890", code: "12345", smsConsent: true },
      { phoneNumber: "1234567890", code: "1234567", smsConsent: true },
      { phoneNumber: "1234567890", code: "", smsConsent: true },
      { phoneNumber: "1234567890", code: "1", smsConsent: true },
    ];

    invalidCodes.forEach((input) => {
      const result = verifyCodeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  it("should reject codes that contain non-digit characters", () => {
    const invalidCodes = [
      { phoneNumber: "1234567890", code: "12345a", smsConsent: true },
      { phoneNumber: "1234567890", code: "12-456", smsConsent: true },
      { phoneNumber: "1234567890", code: "12 456", smsConsent: true },
      { phoneNumber: "1234567890", code: "123.56", smsConsent: true },
      { phoneNumber: "1234567890", code: "abcdef", smsConsent: true },
    ];

    invalidCodes.forEach((input) => {
      const result = verifyCodeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  it("should reject invalid phone numbers", () => {
    const invalidPhoneNumbers = [
      { phoneNumber: "123", code: "123456", smsConsent: true },
      { phoneNumber: "123456789012345678901", code: "123456", smsConsent: true },
      { phoneNumber: "", code: "123456", smsConsent: true },
    ];

    invalidPhoneNumbers.forEach((input) => {
      const result = verifyCodeSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  it("should provide helpful error messages for invalid codes", () => {
    const result = verifyCodeSchema.safeParse({
      phoneNumber: "1234567890",
      code: "12345",
      smsConsent: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("exactly 6 characters");
    }
  });

  it("should provide helpful error messages for non-digit codes", () => {
    const result = verifyCodeSchema.safeParse({
      phoneNumber: "1234567890",
      code: "12345a",
      smsConsent: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues
        .map((issue: { message: string }) => issue.message)
        .join(" ");
      expect(messages).toContain("digits");
    }
  });

  it("should reject missing required fields", () => {
    const result1 = verifyCodeSchema.safeParse({
      phoneNumber: "1234567890",
      smsConsent: true,
    });
    expect(result1.success).toBe(false);

    const result2 = verifyCodeSchema.safeParse({
      code: "123456",
      smsConsent: true,
    });
    expect(result2.success).toBe(false);

    const result3 = verifyCodeSchema.safeParse({});
    expect(result3.success).toBe(false);
  });
});

describe("completeProfileSchema", () => {
  it("should accept valid profile data", () => {
    const validProfiles = [
      { displayName: "John Doe" },
      { displayName: "Alice", timezone: "America/New_York" },
      { displayName: "Bob Smith", timezone: "Europe/London" },
      { displayName: "JD" + "x".repeat(48) }, // Exactly 50 characters
      { displayName: "abc" }, // Exactly 3 characters
    ];

    validProfiles.forEach((profile) => {
      expect(() => completeProfileSchema.parse(profile)).not.toThrow();
    });
  });

  it("should accept profile without timezone (optional field)", () => {
    const profile = { displayName: "John Doe" };
    expect(() => completeProfileSchema.parse(profile)).not.toThrow();

    const parsed = completeProfileSchema.parse(profile);
    expect(parsed.timezone).toBeUndefined();
  });

  it("should reject display names that are too short", () => {
    const shortNames = [
      { displayName: "ab" }, // 2 characters
      { displayName: "a" }, // 1 character
      { displayName: "" }, // Empty string
    ];

    shortNames.forEach((profile) => {
      const result = completeProfileSchema.safeParse(profile);
      expect(result.success).toBe(false);
    });
  });

  it("should reject display names that are too long", () => {
    const longNames = [
      { displayName: "a".repeat(51) }, // 51 characters
      { displayName: "a".repeat(100) }, // 100 characters
    ];

    longNames.forEach((profile) => {
      const result = completeProfileSchema.safeParse(profile);
      expect(result.success).toBe(false);
    });
  });

  it("should provide helpful error messages for short display names", () => {
    const result = completeProfileSchema.safeParse({ displayName: "ab" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "at least 3 characters",
      );
    }
  });

  it("should provide helpful error messages for long display names", () => {
    const result = completeProfileSchema.safeParse({
      displayName: "a".repeat(51),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "not exceed 50 characters",
      );
    }
  });

  it("should reject missing displayName field", () => {
    const result = completeProfileSchema.safeParse({
      timezone: "America/New_York",
    });
    expect(result.success).toBe(false);
  });

  it("should accept valid IANA timezone strings", () => {
    const timezones = [
      "America/New_York",
      "Europe/London",
      "Asia/Tokyo",
      "Australia/Sydney",
      "UTC",
      "America/Los_Angeles",
    ];

    timezones.forEach((timezone) => {
      const profile = { displayName: "Test User", timezone };
      expect(() => completeProfileSchema.parse(profile)).not.toThrow();
    });
  });

  it("should accept edge case display names with valid lengths", () => {
    const edgeCases = [
      { displayName: "abc" }, // Minimum length (3)
      { displayName: "a".repeat(50) }, // Maximum length (50)
      { displayName: "John Doe Jr." }, // With punctuation
      { displayName: "123" }, // Numbers
      { displayName: "User 123" }, // Mixed
    ];

    edgeCases.forEach((profile) => {
      expect(() => completeProfileSchema.parse(profile)).not.toThrow();
    });
  });
});
