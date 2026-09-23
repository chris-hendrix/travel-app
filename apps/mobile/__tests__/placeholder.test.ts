import { describe, expect, it } from "vitest";
import { placeholderPhoto } from "@/lib/placeholder";

describe("placeholderPhoto", () => {
  it("is deterministic for a seed", () => {
    expect(placeholderPhoto("event-1")).toBe(placeholderPhoto("event-1"));
  });

  it("returns a distinct value for a distinct seed", () => {
    expect(placeholderPhoto("event-2")).not.toBe(placeholderPhoto("event-1"));
  });
});
