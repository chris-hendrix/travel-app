import { describe, it, expect } from "vitest";
import { toDisplayTemp } from "./weather-codes";

describe("toDisplayTemp", () => {
  it("rounds celsius values to nearest integer", () => {
    expect(toDisplayTemp(22.6, "celsius")).toBe(23);
    expect(toDisplayTemp(22.4, "celsius")).toBe(22);
  });

  it("returns exact integer celsius unchanged", () => {
    expect(toDisplayTemp(20, "celsius")).toBe(20);
  });

  it("converts 0°C to 32°F", () => {
    expect(toDisplayTemp(0, "fahrenheit")).toBe(32);
  });

  it("converts 100°C to 212°F", () => {
    expect(toDisplayTemp(100, "fahrenheit")).toBe(212);
  });

  it("converts negative celsius to fahrenheit", () => {
    // -40°C === -40°F
    expect(toDisplayTemp(-40, "fahrenheit")).toBe(-40);
  });

  it("rounds fahrenheit result to nearest integer", () => {
    // 22.6°C = 22.6 * 9/5 + 32 = 72.68 → 73
    expect(toDisplayTemp(22.6, "fahrenheit")).toBe(73);
  });

  it("handles negative celsius in celsius mode", () => {
    expect(toDisplayTemp(-5.3, "celsius")).toBe(-5);
  });
});
