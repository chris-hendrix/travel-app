// Tests for event validation schemas

import { describe, it, expect } from "vitest";
import { createEventSchema, updateEventSchema } from "../schemas/index.js";

describe("createEventSchema", () => {
  it("should accept valid event data with all required fields", () => {
    const validEvents = [
      {
        name: "Flight to Miami",
        eventType: "travel" as const,
        startTime: "2026-07-15T10:00:00Z",
      },
      {
        name: "Dinner at Italian Restaurant",
        eventType: "meal" as const,
        startTime: "2026-07-15T19:00:00Z",
        endTime: "2026-07-15T21:00:00Z",
      },
      {
        name: "Beach Volleyball",
        eventType: "activity" as const,
        startTime: "2026-07-16T14:00:00Z",
        location: "South Beach",
        description: "Friendly beach volleyball game",
      },
    ];

    validEvents.forEach((event) => {
      expect(() => createEventSchema.parse(event)).not.toThrow();
    });
  });

  it("should accept event with all optional fields", () => {
    const event = {
      name: "Conference Talk",
      eventType: "activity" as const,
      startTime: "2026-08-10T14:00:00Z",
      endTime: "2026-08-10T15:30:00Z",
      description: "Keynote presentation on AI",
      location: "Convention Center, Room 101",
      allDay: false,
      isOptional: true,
      links: [
        { url: "https://example.com/conference" },
        { url: "https://example.com/speaker-bio" },
      ],
    };

    expect(() => createEventSchema.parse(event)).not.toThrow();
  });

  it("should apply default values for allDay and isOptional", () => {
    const event = {
      name: "Morning Yoga",
      eventType: "activity" as const,
      startTime: "2026-07-16T07:00:00Z",
    };

    const parsed = createEventSchema.parse(event);
    expect(parsed.allDay).toBe(false);
    expect(parsed.isOptional).toBe(false);
  });

  it("should accept event name at boundary lengths", () => {
    const events = [
      {
        name: "A",
        eventType: "meal" as const,
        startTime: "2026-07-15T12:00:00Z",
      }, // Minimum (1)
      {
        name: "a".repeat(255),
        eventType: "activity" as const,
        startTime: "2026-07-15T12:00:00Z",
      }, // Maximum (255)
    ];

    events.forEach((event) => {
      expect(() => createEventSchema.parse(event)).not.toThrow();
    });
  });

  it("should reject event names that are too short", () => {
    const event = {
      name: "",
      eventType: "meal",
      startTime: "2026-07-15T12:00:00Z",
    };

    const result = createEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("at least 1 character");
    }
  });

  it("should reject event names that are too long", () => {
    const longName = "a".repeat(256);
    const event = {
      name: longName,
      eventType: "meal",
      startTime: "2026-07-15T12:00:00Z",
    };

    const result = createEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "not exceed 255 characters",
      );
    }
  });

  it("should reject missing required fields", () => {
    const invalidEvents = [
      { eventType: "meal", startTime: "2026-07-15T12:00:00Z" }, // Missing name
      { name: "Lunch", startTime: "2026-07-15T12:00:00Z" }, // Missing eventType
      { name: "Lunch", eventType: "meal" }, // Missing startTime
      {}, // Missing all required fields
    ];

    invalidEvents.forEach((event) => {
      const result = createEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  it("should reject invalid event types", () => {
    const invalidEventTypes = ["invalid", "leisure", "work", "", "MEAL"];

    invalidEventTypes.forEach((eventType) => {
      const event = {
        name: "Test Event",
        eventType,
        startTime: "2026-07-15T12:00:00Z",
      };

      const result = createEventSchema.safeParse(event);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "Event type must be one of: travel, meal, activity",
        );
      }
    });
  });

  it("should accept valid event types", () => {
    const validEventTypes: Array<"travel" | "meal" | "activity"> = [
      "travel",
      "meal",
      "activity",
    ];

    validEventTypes.forEach((eventType) => {
      const event = {
        name: "Test Event",
        eventType,
        startTime: "2026-07-15T12:00:00Z",
      };

      expect(() => createEventSchema.parse(event)).not.toThrow();
    });
  });

  it("should reject invalid datetime formats for startTime", () => {
    const invalidDatetimes = [
      "2026-07-15", // Date only
      "2026-07-15T12:00:00", // Missing timezone
      "2026/07/15T12:00:00Z", // Wrong date separator
      "July 15, 2026 12:00 PM", // Wrong format
      "not-a-datetime", // Invalid format
    ];

    invalidDatetimes.forEach((startTime) => {
      const event = {
        name: "Test Event",
        eventType: "meal" as const,
        startTime,
      };

      const result = createEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  it("should accept valid ISO 8601 datetime strings for startTime", () => {
    const validDatetimes = [
      "2026-07-15T12:00:00Z",
      "2026-07-15T12:00:00.123Z",
      "2026-12-31T23:59:59Z",
    ];

    validDatetimes.forEach((startTime) => {
      const event = {
        name: "Test Event",
        eventType: "meal" as const,
        startTime,
      };

      expect(() => createEventSchema.parse(event)).not.toThrow();
    });
  });

  it("should reject invalid datetime formats for endTime", () => {
    const invalidDatetimes = [
      "2026-07-15", // Date only
      "2026-07-15T14:00:00", // Missing timezone
      "not-a-datetime", // Invalid format
    ];

    invalidDatetimes.forEach((endTime) => {
      const event = {
        name: "Test Event",
        eventType: "meal" as const,
        startTime: "2026-07-15T12:00:00Z",
        endTime,
      };

      const result = createEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  it("should reject endTime before startTime", () => {
    const event = {
      name: "Test Event",
      eventType: "meal" as const,
      startTime: "2026-07-15T14:00:00Z",
      endTime: "2026-07-15T12:00:00Z",
    };

    const result = createEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "End time must be after start time",
      );
      expect(result.error.issues[0]?.path).toContain("endTime");
    }
  });

  it("should reject endTime equal to startTime", () => {
    const event = {
      name: "Test Event",
      eventType: "meal" as const,
      startTime: "2026-07-15T12:00:00Z",
      endTime: "2026-07-15T12:00:00Z",
    };

    const result = createEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "End time must be after start time",
      );
    }
  });

  it("should accept endTime after startTime", () => {
    const event = {
      name: "Test Event",
      eventType: "meal" as const,
      startTime: "2026-07-15T12:00:00Z",
      endTime: "2026-07-15T14:00:00Z",
    };

    expect(() => createEventSchema.parse(event)).not.toThrow();
  });

  it("should accept event without endTime", () => {
    const event = {
      name: "Test Event",
      eventType: "meal" as const,
      startTime: "2026-07-15T12:00:00Z",
    };

    expect(() => createEventSchema.parse(event)).not.toThrow();
  });

  it("should reject description that exceeds max length", () => {
    const longDescription = "a".repeat(2001);
    const event = {
      name: "Test Event",
      eventType: "meal" as const,
      startTime: "2026-07-15T12:00:00Z",
      description: longDescription,
    };

    const result = createEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "not exceed 2000 characters",
      );
    }
  });

  it("should accept description at max length", () => {
    const maxDescription = "a".repeat(2000);
    const event = {
      name: "Test Event",
      eventType: "meal" as const,
      startTime: "2026-07-15T12:00:00Z",
      description: maxDescription,
    };

    expect(() => createEventSchema.parse(event)).not.toThrow();
  });

  it("should reject invalid URLs in links array", () => {
    const invalidUrls = [
      [{ url: "not-a-url" }],
      [{ url: "https://valid.com" }, { url: "invalid-url" }],
      [{ url: "just text" }],
      [{ url: "example.com" }], // Missing protocol
    ];

    invalidUrls.forEach((links) => {
      const event = {
        name: "Test Event",
        eventType: "meal" as const,
        startTime: "2026-07-15T12:00:00Z",
        links,
      };

      const result = createEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  it("should accept valid URLs in links array", () => {
    const validUrls = [
      [{ url: "https://example.com" }],
      [{ url: "http://example.com/path" }],
      [{ url: "https://example.com" }, { url: "https://another.com/page" }],
      [{ url: "https://cdn.example.com/resource.pdf" }],
    ];

    validUrls.forEach((links) => {
      const event = {
        name: "Test Event",
        eventType: "meal" as const,
        startTime: "2026-07-15T12:00:00Z",
        links,
      };

      expect(() => createEventSchema.parse(event)).not.toThrow();
    });
  });

  it("should reject links array exceeding max items", () => {
    const tooManyLinks = Array(11).fill({ url: "https://example.com" });
    const event = {
      name: "Test Event",
      eventType: "meal" as const,
      startTime: "2026-07-15T12:00:00Z",
      links: tooManyLinks,
    };

    const result = createEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("not exceed 10 items");
    }
  });

  it("should accept links array at max items", () => {
    const maxLinks = Array(10).fill({ url: "https://example.com" });
    const event = {
      name: "Test Event",
      eventType: "meal" as const,
      startTime: "2026-07-15T12:00:00Z",
      links: maxLinks,
    };

    expect(() => createEventSchema.parse(event)).not.toThrow();
  });

  it("should accept empty links array", () => {
    const event = {
      name: "Test Event",
      eventType: "meal" as const,
      startTime: "2026-07-15T12:00:00Z",
      links: [],
    };

    expect(() => createEventSchema.parse(event)).not.toThrow();
  });

  it("should accept links with optional name", () => {
    const event = {
      name: "Test Event",
      eventType: "meal" as const,
      startTime: "2026-07-15T12:00:00Z",
      links: [
        { url: "https://example.com", name: "Reservation" },
        { url: "https://maps.example.com" },
      ],
    };

    expect(() => createEventSchema.parse(event)).not.toThrow();
  });

  it("should reject link name exceeding 100 characters", () => {
    const event = {
      name: "Test Event",
      eventType: "meal" as const,
      startTime: "2026-07-15T12:00:00Z",
      links: [{ url: "https://example.com", name: "a".repeat(101) }],
    };

    const result = createEventSchema.safeParse(event);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "not exceed 100 characters",
      );
    }
  });

  it("should reject link missing url", () => {
    const event = {
      name: "Test Event",
      eventType: "meal" as const,
      startTime: "2026-07-15T12:00:00Z",
      links: [{ name: "No URL here" }],
    };

    const result = createEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

describe("updateEventSchema", () => {
  it("should accept partial updates with any single field", () => {
    const partialUpdates = [
      { name: "Updated Event Name" },
      { description: "Updated description" },
      { eventType: "activity" as const },
      { location: "New Location" },
      { startTime: "2026-08-01T10:00:00Z" },
      { endTime: "2026-08-01T12:00:00Z" },
      { allDay: true },
      { isOptional: true },
      { links: [{ url: "https://example.com" }] },
    ];

    partialUpdates.forEach((update) => {
      expect(() => updateEventSchema.parse(update)).not.toThrow();
    });
  });

  it("should accept partial updates with multiple fields", () => {
    const update = {
      name: "Updated Event",
      eventType: "meal" as const,
      startTime: "2026-08-15T18:00:00Z",
      endTime: "2026-08-15T20:00:00Z",
      location: "New Restaurant",
    };

    expect(() => updateEventSchema.parse(update)).not.toThrow();
  });

  it("should accept empty object (no updates)", () => {
    expect(() => updateEventSchema.parse({})).not.toThrow();
  });

  it("should still validate field constraints when provided", () => {
    const invalidUpdates = [
      { name: "" }, // Too short
      { name: "a".repeat(256) }, // Too long
      { eventType: "invalid" }, // Invalid enum
      { startTime: "not-a-datetime" }, // Invalid datetime format
      { endTime: "2026-07-15" }, // Invalid datetime format
      { description: "a".repeat(2001) }, // Too long
      { links: [{ url: "not-a-url" }] }, // Invalid URL
      { links: Array(11).fill({ url: "https://example.com" }) }, // Too many links
    ];

    invalidUpdates.forEach((update) => {
      const result = updateEventSchema.safeParse(update);
      expect(result.success).toBe(false);
    });
  });

  it("should still validate time cross-validation when both times provided", () => {
    const update = {
      startTime: "2026-07-15T14:00:00Z",
      endTime: "2026-07-15T12:00:00Z",
    };

    const result = updateEventSchema.safeParse(update);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "End time must be after start time",
      );
    }
  });

  it("should allow updating startTime without endTime", () => {
    const update = {
      startTime: "2026-08-01T10:00:00Z",
    };

    expect(() => updateEventSchema.parse(update)).not.toThrow();
  });

  it("should allow updating endTime without startTime", () => {
    const update = {
      endTime: "2026-08-01T12:00:00Z",
    };

    expect(() => updateEventSchema.parse(update)).not.toThrow();
  });

  it("should reject endTime equal to startTime when both provided", () => {
    const update = {
      startTime: "2026-07-15T12:00:00Z",
      endTime: "2026-07-15T12:00:00Z",
    };

    const result = updateEventSchema.safeParse(update);
    expect(result.success).toBe(false);
  });

  it("should accept valid partial update with cross-validation passing", () => {
    const update = {
      startTime: "2026-07-15T12:00:00Z",
      endTime: "2026-07-15T14:00:00Z",
    };

    expect(() => updateEventSchema.parse(update)).not.toThrow();
  });
});
