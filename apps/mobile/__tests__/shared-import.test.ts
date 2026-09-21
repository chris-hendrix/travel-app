import { describe, expect, it } from "vitest";
import { emailSchema } from "@journiful/shared/schemas";

describe("shared-import (Node-side sanity)", () => {
  it("parses a known-good email", () => {
    expect(emailSchema.safeParse("test@example.com").success).toBe(true);
  });

  it("rejects a known-bad email", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});
