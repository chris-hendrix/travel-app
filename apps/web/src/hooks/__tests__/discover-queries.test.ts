import { describe, it, expect } from "vitest";
import { discoverQueryOptions } from "../discover-queries";

describe("discoverQueryOptions enabled gate", () => {
  it("is enabled when coords are present and enabled is not false", () => {
    expect(
      discoverQueryOptions("trip-1", 48.85, 2.35, "Paris").enabled,
    ).toBe(true);
  });

  it("is disabled when enabled=false even with valid coords", () => {
    expect(
      discoverQueryOptions("trip-1", 48.85, 2.35, "Paris", false, false)
        .enabled,
    ).toBe(false);
  });

  it("is disabled when coords are missing even with enabled=true", () => {
    expect(discoverQueryOptions("trip-1", null, null, undefined).enabled).toBe(
      false,
    );
    expect(
      discoverQueryOptions("trip-1", null, null, undefined, false, true)
        .enabled,
    ).toBe(false);
  });
});
