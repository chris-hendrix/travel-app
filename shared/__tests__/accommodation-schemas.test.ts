// Tests for accommodation validation schemas

import { describe, it, expect } from "vitest";
import {
  createAccommodationSchema,
  updateAccommodationSchema,
} from "../schemas/index.js";

describe("createAccommodationSchema", () => {
  it("should accept valid accommodation data with all required fields", () => {
    const validAccommodations = [
      {
        name: "Beachfront Hotel",
        checkIn: "2026-07-15T14:00:00.000Z",
        checkOut: "2026-07-20T11:00:00.000Z",
      },
      {
        name: "Downtown Apartment",
        checkIn: "2026-08-01T15:00:00.000Z",
        checkOut: "2026-08-10T10:00:00.000Z",
        address: "123 Main St, City, State 12345",
      },
      {
        name: "Mountain Cabin",
        checkIn: "2026-09-05T16:00:00.000Z",
        checkOut: "2026-09-12T11:00:00.000Z",
        description: "Cozy cabin with lake view",
        address: "456 Forest Road",
      },
    ];

    validAccommodations.forEach((accommodation) => {
      expect(() =>
        createAccommodationSchema.parse(accommodation),
      ).not.toThrow();
    });
  });

  it("should accept accommodation with all optional fields", () => {
    const accommodation = {
      name: "Luxury Resort",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-22T11:00:00.000Z",
      address: "789 Beach Boulevard, Miami, FL 33139",
      description: "Five-star resort with ocean view and spa facilities",
      links: [
        { url: "https://example.com/resort" },
        { url: "https://example.com/booking" },
        { url: "https://example.com/amenities" },
      ],
    };

    expect(() => createAccommodationSchema.parse(accommodation)).not.toThrow();
  });

  it("should accept accommodation name at boundary lengths", () => {
    const accommodations = [
      {
        name: "A",
        checkIn: "2026-07-15T14:00:00.000Z",
        checkOut: "2026-07-16T11:00:00.000Z",
      }, // Minimum (1)
      {
        name: "a".repeat(255),
        checkIn: "2026-07-15T14:00:00.000Z",
        checkOut: "2026-07-16T11:00:00.000Z",
      }, // Maximum (255)
    ];

    accommodations.forEach((accommodation) => {
      expect(() =>
        createAccommodationSchema.parse(accommodation),
      ).not.toThrow();
    });
  });

  it("should reject accommodation names that are too short", () => {
    const accommodation = {
      name: "",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-16T11:00:00.000Z",
    };

    const result = createAccommodationSchema.safeParse(accommodation);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("at least 1 character");
    }
  });

  it("should reject accommodation names that are too long", () => {
    const longName = "a".repeat(256);
    const accommodation = {
      name: longName,
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-16T11:00:00.000Z",
    };

    const result = createAccommodationSchema.safeParse(accommodation);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "not exceed 255 characters",
      );
    }
  });

  it("should reject missing required fields", () => {
    const invalidAccommodations = [
      {
        checkIn: "2026-07-15T14:00:00.000Z",
        checkOut: "2026-07-16T11:00:00.000Z",
      }, // Missing name
      { name: "Hotel", checkOut: "2026-07-16T11:00:00.000Z" }, // Missing checkIn
      { name: "Hotel", checkIn: "2026-07-15T14:00:00.000Z" }, // Missing checkOut
      {}, // Missing all required fields
    ];

    invalidAccommodations.forEach((accommodation) => {
      const result = createAccommodationSchema.safeParse(accommodation);
      expect(result.success).toBe(false);
    });
  });

  it("should reject invalid datetime formats for checkIn", () => {
    const invalidDates = [
      "2026-07-15", // Date-only (no longer accepted)
      "2026-13-01T14:00:00.000Z", // Invalid month
      "26-07-15T14:00:00.000Z", // Wrong format
      "2026/07/15T14:00:00.000Z", // Wrong separator
      "July 15, 2026", // Wrong format
      "not-a-date", // Invalid format
    ];

    invalidDates.forEach((checkIn) => {
      const accommodation = {
        name: "Hotel",
        checkIn,
        checkOut: "2026-07-16T11:00:00.000Z",
      };

      const result = createAccommodationSchema.safeParse(accommodation);
      expect(result.success).toBe(false);
    });
  });

  it("should reject invalid datetime formats for checkOut", () => {
    const invalidDates = [
      "2026-07-16", // Date-only (no longer accepted)
      "26-07-16T14:00:00.000Z", // Wrong format
      "not-a-date", // Invalid format
    ];

    invalidDates.forEach((checkOut) => {
      const accommodation = {
        name: "Hotel",
        checkIn: "2026-07-15T14:00:00.000Z",
        checkOut,
      };

      const result = createAccommodationSchema.safeParse(accommodation);
      expect(result.success).toBe(false);
    });
  });

  it("should accept valid ISO datetime strings", () => {
    const validDates = [
      {
        checkIn: "2026-01-15T14:00:00.000Z",
        checkOut: "2026-01-20T11:00:00.000Z",
      },
      {
        checkIn: "2026-12-01T15:00:00.000Z",
        checkOut: "2026-12-31T10:00:00.000Z",
      },
      {
        checkIn: "2026-02-28T14:00:00.000Z",
        checkOut: "2026-03-05T11:00:00.000Z",
      },
      {
        checkIn: "2024-02-29T14:00:00.000Z",
        checkOut: "2024-03-05T11:00:00.000Z",
      }, // Leap year
    ];

    validDates.forEach(({ checkIn, checkOut }) => {
      const accommodation = {
        name: "Hotel",
        checkIn,
        checkOut,
      };

      expect(() =>
        createAccommodationSchema.parse(accommodation),
      ).not.toThrow();
    });
  });

  it("should accept datetime strings with timezone offset", () => {
    const validDates = [
      {
        checkIn: "2026-07-15T14:00:00+05:00",
        checkOut: "2026-07-20T11:00:00+05:00",
      },
      {
        checkIn: "2026-07-15T14:00:00-04:00",
        checkOut: "2026-07-20T11:00:00-04:00",
      },
      {
        checkIn: "2026-07-15T14:00:00+00:00",
        checkOut: "2026-07-20T11:00:00+00:00",
      },
    ];

    validDates.forEach(({ checkIn, checkOut }) => {
      const accommodation = {
        name: "Hotel",
        checkIn,
        checkOut,
      };

      expect(() =>
        createAccommodationSchema.parse(accommodation),
      ).not.toThrow();
    });
  });

  it("should reject checkOut before checkIn", () => {
    const accommodation = {
      name: "Hotel",
      checkIn: "2026-07-20T14:00:00.000Z",
      checkOut: "2026-07-15T11:00:00.000Z",
    };

    const result = createAccommodationSchema.safeParse(accommodation);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Check-out date must be after check-in date",
      );
      expect(result.error.issues[0]?.path).toContain("checkOut");
    }
  });

  it("should reject checkOut equal to checkIn", () => {
    const accommodation = {
      name: "Hotel",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-15T14:00:00.000Z",
    };

    const result = createAccommodationSchema.safeParse(accommodation);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Check-out date must be after check-in date",
      );
    }
  });

  it("should accept checkOut after checkIn", () => {
    const accommodation = {
      name: "Hotel",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-20T11:00:00.000Z",
    };

    expect(() => createAccommodationSchema.parse(accommodation)).not.toThrow();
  });

  it("should accept single day difference", () => {
    const accommodation = {
      name: "Hotel",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-16T11:00:00.000Z",
    };

    expect(() => createAccommodationSchema.parse(accommodation)).not.toThrow();
  });

  it("should reject description that exceeds max length", () => {
    const longDescription = "a".repeat(2001);
    const accommodation = {
      name: "Hotel",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-16T11:00:00.000Z",
      description: longDescription,
    };

    const result = createAccommodationSchema.safeParse(accommodation);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "not exceed 2000 characters",
      );
    }
  });

  it("should accept description at max length", () => {
    const maxDescription = "a".repeat(2000);
    const accommodation = {
      name: "Hotel",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-16T11:00:00.000Z",
      description: maxDescription,
    };

    expect(() => createAccommodationSchema.parse(accommodation)).not.toThrow();
  });

  it("should reject invalid URLs in links array", () => {
    const invalidUrls = [
      [{ url: "not-a-url" }],
      [{ url: "https://valid.com" }, { url: "invalid-url" }],
      [{ url: "just text" }],
      [{ url: "example.com" }], // Missing protocol
    ];

    invalidUrls.forEach((links) => {
      const accommodation = {
        name: "Hotel",
        checkIn: "2026-07-15T14:00:00.000Z",
        checkOut: "2026-07-16T11:00:00.000Z",
        links,
      };

      const result = createAccommodationSchema.safeParse(accommodation);
      expect(result.success).toBe(false);
    });
  });

  it("should accept valid URLs in links array", () => {
    const validUrls = [
      [{ url: "https://example.com" }],
      [{ url: "http://example.com/booking" }],
      [{ url: "https://example.com" }, { url: "https://another.com/reviews" }],
      [{ url: "https://cdn.example.com/brochure.pdf" }],
    ];

    validUrls.forEach((links) => {
      const accommodation = {
        name: "Hotel",
        checkIn: "2026-07-15T14:00:00.000Z",
        checkOut: "2026-07-16T11:00:00.000Z",
        links,
      };

      expect(() =>
        createAccommodationSchema.parse(accommodation),
      ).not.toThrow();
    });
  });

  it("should reject links array exceeding max items", () => {
    const tooManyLinks = Array(11).fill({ url: "https://example.com" });
    const accommodation = {
      name: "Hotel",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-16T11:00:00.000Z",
      links: tooManyLinks,
    };

    const result = createAccommodationSchema.safeParse(accommodation);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("not exceed 10 items");
    }
  });

  it("should accept links array at max items", () => {
    const maxLinks = Array(10).fill({ url: "https://example.com" });
    const accommodation = {
      name: "Hotel",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-16T11:00:00.000Z",
      links: maxLinks,
    };

    expect(() => createAccommodationSchema.parse(accommodation)).not.toThrow();
  });

  it("should accept empty links array", () => {
    const accommodation = {
      name: "Hotel",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-16T11:00:00.000Z",
      links: [],
    };

    expect(() => createAccommodationSchema.parse(accommodation)).not.toThrow();
  });

  it("should accept links with optional name", () => {
    const accommodation = {
      name: "Hotel",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-16T11:00:00.000Z",
      links: [
        { url: "https://example.com/booking", name: "Reservation" },
        { url: "https://maps.example.com" },
      ],
    };

    expect(() => createAccommodationSchema.parse(accommodation)).not.toThrow();
  });

  it("should reject link name exceeding 100 characters", () => {
    const accommodation = {
      name: "Hotel",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-16T11:00:00.000Z",
      links: [{ url: "https://example.com", name: "a".repeat(101) }],
    };

    const result = createAccommodationSchema.safeParse(accommodation);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "not exceed 100 characters",
      );
    }
  });

  it("should reject link missing url", () => {
    const accommodation = {
      name: "Hotel",
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-16T11:00:00.000Z",
      links: [{ name: "No URL here" }],
    };

    const result = createAccommodationSchema.safeParse(accommodation);
    expect(result.success).toBe(false);
  });
});

describe("updateAccommodationSchema", () => {
  it("should accept partial updates with any single field", () => {
    const partialUpdates = [
      { name: "Updated Hotel Name" },
      { address: "New Address" },
      { description: "Updated description" },
      { checkIn: "2026-08-01T14:00:00.000Z" },
      { checkOut: "2026-08-10T11:00:00.000Z" },
      { links: [{ url: "https://example.com" }] },
    ];

    partialUpdates.forEach((update) => {
      expect(() => updateAccommodationSchema.parse(update)).not.toThrow();
    });
  });

  it("should accept partial updates with multiple fields", () => {
    const update = {
      name: "Updated Hotel",
      address: "New Address",
      checkIn: "2026-08-01T14:00:00.000Z",
      checkOut: "2026-08-10T11:00:00.000Z",
    };

    expect(() => updateAccommodationSchema.parse(update)).not.toThrow();
  });

  it("should accept empty object (no updates)", () => {
    expect(() => updateAccommodationSchema.parse({})).not.toThrow();
  });

  it("should still validate field constraints when provided", () => {
    const invalidUpdates = [
      { name: "" }, // Too short
      { name: "a".repeat(256) }, // Too long
      { checkIn: "not-a-date" }, // Invalid datetime format
      { checkOut: "2026/07/16" }, // Invalid datetime format
      { description: "a".repeat(2001) }, // Too long
      { links: [{ url: "not-a-url" }] }, // Invalid URL
      { links: Array(11).fill({ url: "https://example.com" }) }, // Too many links
    ];

    invalidUpdates.forEach((update) => {
      const result = updateAccommodationSchema.safeParse(update);
      expect(result.success).toBe(false);
    });
  });

  it("should still validate date cross-validation when both dates provided", () => {
    const update = {
      checkIn: "2026-07-20T14:00:00.000Z",
      checkOut: "2026-07-15T11:00:00.000Z",
    };

    const result = updateAccommodationSchema.safeParse(update);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Check-out date must be after check-in date",
      );
    }
  });

  it("should allow updating checkIn without checkOut", () => {
    const update = {
      checkIn: "2026-08-01T14:00:00.000Z",
    };

    expect(() => updateAccommodationSchema.parse(update)).not.toThrow();
  });

  it("should allow updating checkOut without checkIn", () => {
    const update = {
      checkOut: "2026-08-10T11:00:00.000Z",
    };

    expect(() => updateAccommodationSchema.parse(update)).not.toThrow();
  });

  it("should reject checkOut equal to checkIn when both provided", () => {
    const update = {
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-15T14:00:00.000Z",
    };

    const result = updateAccommodationSchema.safeParse(update);
    expect(result.success).toBe(false);
  });

  it("should accept valid partial update with cross-validation passing", () => {
    const update = {
      checkIn: "2026-07-15T14:00:00.000Z",
      checkOut: "2026-07-20T11:00:00.000Z",
    };

    expect(() => updateAccommodationSchema.parse(update)).not.toThrow();
  });
});
