// Tests for trip validation schemas

import { describe, it, expect, vi } from "vitest";
import {
  createTripSchema,
  updateTripSchema,
  addCoOrganizerSchema,
} from "../schemas/index.js";

describe("timezone validation without Intl.supportedValuesOf", () => {
  // Hermes has no `Intl.supportedValuesOf`: the module used to call it at
  // evaluation time, so on Android the whole schema module failed to load
  // and the app crashed at boot. The schema has to keep working there, and
  // the set it falls back to is the product's own list.
  it("accepts the zones every picker offers when the runtime cannot enumerate", async () => {
    const realIntl = globalThis.Intl;
    try {
      // @ts-expect-error - deliberately removing the API Hermes lacks
      globalThis.Intl = { ...realIntl, supportedValuesOf: undefined };
      vi.resetModules();
      const { createTripSchema } = await import("../schemas/index.js");
      for (const zone of ["America/New_York", "Europe/London", "Asia/Tokyo", "UTC"]) {
        expect(
          createTripSchema.safeParse({
            name: "A trip",
            destination: "Somewhere",
            timezone: zone,
          }).success,
          zone,
        ).toBe(true);
      }
      expect(
        createTripSchema.safeParse({
          name: "A trip",
          destination: "Somewhere",
          timezone: "Mars/Olympus_Mons",
        }).success,
      ).toBe(false);
    } finally {
      globalThis.Intl = realIntl;
      vi.resetModules();
    }
  });
});

describe("createTripSchema", () => {
  it("should accept valid trip data with all required fields", () => {
    const validTrips = [
      {
        name: "Bachelor Party in Miami",
        destination: "Miami Beach, FL",
        timezone: "America/New_York",
      },
      {
        name: "Summer Vacation",
        destination: "Hawaii",
        timezone: "Pacific/Honolulu",
        startDate: "2026-07-15",
        endDate: "2026-07-22",
      },
      {
        name: "Weekend Getaway",
        destination: "London",
        timezone: "Europe/London",
        description: "A quick trip to explore the city",
        coverImageUrl: "https://example.com/image.jpg",
        allowMembersToAddEvents: false,
      },
    ];

    validTrips.forEach((trip) => {
      expect(() => createTripSchema.parse(trip)).not.toThrow();
    });
  });

  it("should accept trip with co-organizer phone numbers", () => {
    const trip = {
      name: "Group Trip",
      destination: "San Francisco",
      timezone: "America/Los_Angeles",
      coOrganizerPhones: ["+14155552671", "+15551234567"],
    };

    expect(() => createTripSchema.parse(trip)).not.toThrow();
  });

  it("should apply default value for allowMembersToAddEvents", () => {
    const trip = {
      name: "Test Trip",
      destination: "Tokyo",
      timezone: "Asia/Tokyo",
    };

    const parsed = createTripSchema.parse(trip);
    expect(parsed.allowMembersToAddEvents).toBe(false);
  });

  it("should apply default value for showAllMembers", () => {
    const trip = {
      name: "Test Trip",
      destination: "Tokyo",
      timezone: "Asia/Tokyo",
    };

    const parsed = createTripSchema.parse(trip);
    expect(parsed.showAllMembers).toBe(false);
  });

  it("should accept null for coverImageUrl", () => {
    const trip = {
      name: "Test Trip",
      destination: "Tokyo",
      timezone: "Asia/Tokyo",
      coverImageUrl: null,
    };

    expect(() => createTripSchema.parse(trip)).not.toThrow();
  });

  it("should reject trip names that are too short", () => {
    const shortNames = [
      { name: "ab", destination: "Test", timezone: "UTC" },
      { name: "a", destination: "Test", timezone: "UTC" },
      { name: "", destination: "Test", timezone: "UTC" },
    ];

    shortNames.forEach((trip) => {
      const result = createTripSchema.safeParse(trip);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "at least 3 characters",
        );
      }
    });
  });

  it("should reject trip names that are too long", () => {
    const longName = "a".repeat(101);
    const trip = {
      name: longName,
      destination: "Test",
      timezone: "UTC",
    };

    const result = createTripSchema.safeParse(trip);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "not exceed 100 characters",
      );
    }
  });

  it("should accept trip name at boundary lengths", () => {
    const trips = [
      { name: "abc", destination: "Test", timezone: "UTC" }, // Minimum (3)
      { name: "a".repeat(100), destination: "Test", timezone: "UTC" }, // Maximum (100)
    ];

    trips.forEach((trip) => {
      expect(() => createTripSchema.parse(trip)).not.toThrow();
    });
  });

  it("should reject empty destination", () => {
    const trip = {
      name: "Test Trip",
      destination: "",
      timezone: "UTC",
    };

    const result = createTripSchema.safeParse(trip);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Destination is required",
      );
    }
  });

  it("should reject missing required fields", () => {
    const invalidTrips = [
      { destination: "Test", timezone: "UTC" }, // Missing name
      { name: "Test", timezone: "UTC" }, // Missing destination
      { name: "Test", destination: "Test" }, // Missing timezone
      {}, // Missing all required fields
    ];

    invalidTrips.forEach((trip) => {
      const result = createTripSchema.safeParse(trip);
      expect(result.success).toBe(false);
    });
  });

  it("should reject invalid IANA timezone strings", () => {
    const invalidTimezones = [
      "EST", // Not IANA format
      "GMT-5", // Not IANA format
      "America/Invalid", // Non-existent timezone
      "Invalid/Timezone", // Non-existent timezone
      "", // Empty string
    ];

    invalidTimezones.forEach((timezone) => {
      const trip = {
        name: "Test Trip",
        destination: "Test",
        timezone,
      };

      const result = createTripSchema.safeParse(trip);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "Invalid IANA timezone identifier",
        );
      }
    });
  });

  it("should accept valid IANA timezone strings", () => {
    const validTimezones = [
      "America/New_York",
      "Europe/London",
      "Asia/Tokyo",
      "Australia/Sydney",
      "UTC",
      "America/Los_Angeles",
      "Pacific/Honolulu",
      "Africa/Cairo",
    ];

    validTimezones.forEach((timezone) => {
      const trip = {
        name: "Test Trip",
        destination: "Test",
        timezone,
      };

      expect(() => createTripSchema.parse(trip)).not.toThrow();
    });
  });

  it("should reject invalid date formats", () => {
    const invalidDates = [
      { startDate: "2026-13-01" }, // Invalid month
      { startDate: "2026-02-30" }, // Invalid day
      { startDate: "26-01-15" }, // Wrong format
      { startDate: "2026/01/15" }, // Wrong separator
      { startDate: "January 15, 2026" }, // Wrong format
      { endDate: "not-a-date" }, // Invalid format
    ];

    invalidDates.forEach((dateField) => {
      const trip = {
        name: "Test Trip",
        destination: "Test",
        timezone: "UTC",
        ...dateField,
      };

      const result = createTripSchema.safeParse(trip);
      expect(result.success).toBe(false);
    });
  });

  it("should accept valid ISO date strings (YYYY-MM-DD)", () => {
    const validDates = [
      "2026-01-15",
      "2026-12-31",
      "2026-02-28",
      "2024-02-29", // Leap year
    ];

    validDates.forEach((date) => {
      const trip = {
        name: "Test Trip",
        destination: "Test",
        timezone: "UTC",
        startDate: date,
      };

      expect(() => createTripSchema.parse(trip)).not.toThrow();
    });
  });

  it("should reject endDate before startDate", () => {
    const trip = {
      name: "Test Trip",
      destination: "Test",
      timezone: "UTC",
      startDate: "2026-10-14",
      endDate: "2026-10-12",
    };

    const result = createTripSchema.safeParse(trip);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "End date must be on or after start date",
      );
      expect(result.error.issues[0]?.path).toContain("endDate");
    }
  });

  it("should accept endDate equal to startDate", () => {
    const trip = {
      name: "Test Trip",
      destination: "Test",
      timezone: "UTC",
      startDate: "2026-10-12",
      endDate: "2026-10-12",
    };

    expect(() => createTripSchema.parse(trip)).not.toThrow();
  });

  it("should accept endDate after startDate", () => {
    const trip = {
      name: "Test Trip",
      destination: "Test",
      timezone: "UTC",
      startDate: "2026-10-12",
      endDate: "2026-10-14",
    };

    expect(() => createTripSchema.parse(trip)).not.toThrow();
  });

  it("should allow startDate without endDate", () => {
    const trip = {
      name: "Test Trip",
      destination: "Test",
      timezone: "UTC",
      startDate: "2026-10-12",
    };

    expect(() => createTripSchema.parse(trip)).not.toThrow();
  });

  it("should allow endDate without startDate", () => {
    const trip = {
      name: "Test Trip",
      destination: "Test",
      timezone: "UTC",
      endDate: "2026-10-14",
    };

    expect(() => createTripSchema.parse(trip)).not.toThrow();
  });

  it("should reject description that exceeds max length", () => {
    const longDescription = "a".repeat(2001);
    const trip = {
      name: "Test Trip",
      destination: "Test",
      timezone: "UTC",
      description: longDescription,
    };

    const result = createTripSchema.safeParse(trip);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "not exceed 2000 characters",
      );
    }
  });

  it("should accept description at max length", () => {
    const maxDescription = "a".repeat(2000);
    const trip = {
      name: "Test Trip",
      destination: "Test",
      timezone: "UTC",
      description: maxDescription,
    };

    expect(() => createTripSchema.parse(trip)).not.toThrow();
  });

  it("should reject invalid URL for coverImageUrl", () => {
    const invalidUrls = [
      "not-a-url",
      "//example.com", // Protocol-relative URL
      "just text",
      "example.com", // Missing protocol
    ];

    invalidUrls.forEach((coverImageUrl) => {
      const trip = {
        name: "Test Trip",
        destination: "Test",
        timezone: "UTC",
        coverImageUrl,
      };

      const result = createTripSchema.safeParse(trip);
      expect(result.success).toBe(false);
    });
  });

  it("should accept valid URLs for coverImageUrl", () => {
    const validUrls = [
      "https://example.com/image.jpg",
      "http://example.com/path/to/image.png",
      "https://cdn.example.com/images/trip-cover.webp",
    ];

    validUrls.forEach((coverImageUrl) => {
      const trip = {
        name: "Test Trip",
        destination: "Test",
        timezone: "UTC",
        coverImageUrl,
      };

      expect(() => createTripSchema.parse(trip)).not.toThrow();
    });
  });

  it("should reject invalid phone numbers in coOrganizerPhones", () => {
    const invalidPhones = [
      ["+1"], // Too short (only 1 digit)
      ["1234567890"], // Missing + prefix
      ["+0155555555"], // Country code starts with 0
      ["invalid-phone"], // Not a phone number
    ];

    invalidPhones.forEach((coOrganizerPhones) => {
      const trip = {
        name: "Test Trip",
        destination: "Test",
        timezone: "UTC",
        coOrganizerPhones,
      };

      const result = createTripSchema.safeParse(trip);
      expect(result.success).toBe(false);
    });
  });

  it("should accept valid E.164 phone numbers in coOrganizerPhones", () => {
    const validPhones = [
      ["+14155552671"],
      ["+442071838750"],
      ["+14155552671", "+15551234567"],
      ["+819012345678"],
    ];

    validPhones.forEach((coOrganizerPhones) => {
      const trip = {
        name: "Test Trip",
        destination: "Test",
        timezone: "UTC",
        coOrganizerPhones,
      };

      expect(() => createTripSchema.parse(trip)).not.toThrow();
    });
  });

  it("should accept empty array for coOrganizerPhones", () => {
    const trip = {
      name: "Test Trip",
      destination: "Test",
      timezone: "UTC",
      coOrganizerPhones: [],
    };

    expect(() => createTripSchema.parse(trip)).not.toThrow();
  });
});

describe("updateTripSchema", () => {
  it("should accept partial updates with any single field", () => {
    const partialUpdates = [
      { name: "Updated Trip Name" },
      { destination: "New Destination" },
      { startDate: "2026-11-01" },
      { endDate: "2026-11-05" },
      { timezone: "Europe/Paris" },
      { description: "Updated description" },
      { coverImageUrl: "https://example.com/new-image.jpg" },
      { allowMembersToAddEvents: false },
      { showAllMembers: true },
    ];

    partialUpdates.forEach((update) => {
      expect(() => updateTripSchema.parse(update)).not.toThrow();
    });
  });

  it("should accept partial updates with multiple fields", () => {
    const update = {
      name: "Updated Trip",
      destination: "Updated Destination",
      startDate: "2026-12-01",
      endDate: "2026-12-05",
    };

    expect(() => updateTripSchema.parse(update)).not.toThrow();
  });

  it("should accept empty object (no updates)", () => {
    expect(() => updateTripSchema.parse({})).not.toThrow();
  });

  it("should still validate field constraints when provided", () => {
    const invalidUpdates = [
      { name: "ab" }, // Too short
      { name: "a".repeat(101) }, // Too long
      { destination: "" }, // Empty
      { timezone: "Invalid/Timezone" }, // Invalid timezone
      { startDate: "not-a-date" }, // Invalid date format
      { description: "a".repeat(2001) }, // Too long
      { coverImageUrl: "not-a-url" }, // Invalid URL
    ];

    invalidUpdates.forEach((update) => {
      const result = updateTripSchema.safeParse(update);
      expect(result.success).toBe(false);
    });
  });

  it("should still validate date cross-validation when both dates provided", () => {
    const update = {
      startDate: "2026-10-14",
      endDate: "2026-10-12",
    };

    const result = updateTripSchema.safeParse(update);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "End date must be on or after start date",
      );
    }
  });

  it("should allow updating startDate without endDate", () => {
    const update = {
      startDate: "2026-11-01",
    };

    expect(() => updateTripSchema.parse(update)).not.toThrow();
  });

  it("should allow updating endDate without startDate", () => {
    const update = {
      endDate: "2026-11-05",
    };

    expect(() => updateTripSchema.parse(update)).not.toThrow();
  });
});

describe("addCoOrganizerSchema", () => {
  it("should accept valid phone number", () => {
    const validInputs = [
      { phoneNumber: "+14155552671" },
      { phoneNumber: "+442071838750" },
      { phoneNumber: "+819012345678" },
      { phoneNumber: "+15551234567" },
    ];

    validInputs.forEach((input) => {
      expect(() => addCoOrganizerSchema.parse(input)).not.toThrow();
    });
  });

  it("should reject missing phoneNumber field", () => {
    const result = addCoOrganizerSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should reject invalid phone numbers", () => {
    const invalidInputs = [
      { phoneNumber: "invalid" },
      { phoneNumber: "1234567890" }, // Missing + prefix
      { phoneNumber: "+1" }, // Too short (only 1 digit)
      { phoneNumber: "+0155555555" }, // Country code starts with 0
      { phoneNumber: "not-a-phone" },
    ];

    invalidInputs.forEach((input) => {
      const result = addCoOrganizerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  it("should provide helpful error messages for invalid phone numbers", () => {
    const input = { phoneNumber: "invalid-phone" };

    const result = addCoOrganizerSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues
        .map((issue) => issue.message)
        .join(" ");
      expect(messages).toContain("E.164 format");
    }
  });
});
