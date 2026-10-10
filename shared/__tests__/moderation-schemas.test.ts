// Tests for moderation validation schemas

import { describe, it, expect } from "vitest";
import { reportUserSchema, blockUserSchema } from "../schemas/index.js";

const USER_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("reportUserSchema", () => {
  it("should accept a report without a note", () => {
    const result = reportUserSchema.safeParse({
      userId: USER_ID,
      reason: "spam",
    });

    expect(result.success).toBe(true);
  });

  it("should strip control characters from the note", () => {
    // The note is the one free-text field an admin reads on a screen of its
    // own, so it follows the same rule as every other one in the repo: a NUL,
    // an ESC or a backspace is removed, not stored.
    const parsed = reportUserSchema.parse({
      userId: USER_ID,
      reason: "harassment",
      note: "kept\u0000 messag\u001bing\u0008 after a no\u001b[31m",
    });

    expect(parsed.note).toBe("kept messaging after a no[31m");
  });

  it("should keep the whitespace a person actually typed", () => {
    const parsed = reportUserSchema.parse({
      userId: USER_ID,
      reason: "other",
      note: "line one\nline two\ttabbed",
    });

    expect(parsed.note).toBe("line one\nline two\ttabbed");
  });

  it("should reject a note longer than 500 characters", () => {
    const result = reportUserSchema.safeParse({
      userId: USER_ID,
      reason: "spam",
      note: "x".repeat(501),
    });

    expect(result.success).toBe(false);
  });

  it("should reject a reason outside the four the app offers", () => {
    const result = reportUserSchema.safeParse({
      userId: USER_ID,
      reason: "dislike",
    });

    expect(result.success).toBe(false);
  });
});

describe("blockUserSchema", () => {
  it("should require a uuid", () => {
    expect(blockUserSchema.safeParse({ userId: "someone" }).success).toBe(
      false,
    );
    expect(blockUserSchema.safeParse({ userId: USER_ID }).success).toBe(true);
  });
});
