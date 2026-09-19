import { describe, expect, it } from "vitest";
import { joinFacts, NOT_SHARED } from "@/lib/wording";

describe("joinFacts", () => {
  it("joins separate facts with a middot", () => {
    expect(joinFacts("Sat Sep 19", "12:30 PM", "BCN T1")).toBe(
      "Sat Sep 19 · 12:30 PM · BCN T1",
    );
  });

  it("drops empty parts rather than stranding a separator", () => {
    expect(joinFacts("Sat Sep 19", null, "BCN T1")).toBe(
      "Sat Sep 19 · BCN T1",
    );
    expect(joinFacts("Sat Sep 19", "  ", undefined)).toBe("Sat Sep 19");
  });

  it("leaves a single fact alone", () => {
    expect(joinFacts("Today", "Fri Sep 18")).toBe("Today · Fri Sep 18");
    expect(joinFacts("Fri Sep 18")).toBe("Fri Sep 18");
  });

  it("does not touch the commas inside a date", () => {
    // A comma stays inside one fact; only the joins are middots.
    expect(joinFacts("Sep 18–26, 2026", "Mallorca")).toBe(
      "Sep 18–26, 2026 · Mallorca",
    );
  });
});

describe("NOT_SHARED", () => {
  it("is one phrase, so one state has one name", () => {
    expect(NOT_SHARED).toBe("Not shared yet");
  });
});
