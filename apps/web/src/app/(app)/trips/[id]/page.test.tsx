import { describe, it, expect } from "vitest";
import TripDefaultPage from "./page";

describe("TripDefaultPage", () => {
  it("exports a default component", () => {
    expect(typeof TripDefaultPage).toBe("function");
  });
});
