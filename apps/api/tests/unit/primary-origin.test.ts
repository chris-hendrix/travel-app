import { describe, expect, it } from "vitest";
import { primaryOrigin } from "@/config/env.js";

describe("primaryOrigin", () => {
  it("returns the first of two origins", () => {
    expect(primaryOrigin("https://a.example,https://b.example")).toBe(
      "https://a.example",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(primaryOrigin("  https://a.example  ,  https://b.example  ")).toBe(
      "https://a.example",
    );
  });

  it("skips empty entries", () => {
    expect(primaryOrigin("https://a.example, ,https://b.example")).toBe(
      "https://a.example",
    );
  });

  it("returns a single origin unchanged", () => {
    expect(primaryOrigin("https://journiful.app")).toBe(
      "https://journiful.app",
    );
  });

  it("falls back when the value is all empty", () => {
    expect(primaryOrigin("  , , ")).toBe("https://journiful.app");
    expect(primaryOrigin("")).toBe("https://journiful.app");
  });
});
