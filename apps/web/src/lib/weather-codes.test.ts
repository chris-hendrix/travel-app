import { describe, it, expect } from "vitest";
import { toDisplayTemp, toDisplayWindSpeed, windSpeedUnit } from "./weather-codes";

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

describe("toDisplayWindSpeed", () => {
  it("rounds km/h for celsius (metric)", () => {
    expect(toDisplayWindSpeed(10, "celsius")).toBe(10);
    expect(toDisplayWindSpeed(10.7, "celsius")).toBe(11);
  });

  it("converts km/h to mph for fahrenheit (imperial)", () => {
    expect(toDisplayWindSpeed(10, "fahrenheit")).toBe(6);
    expect(toDisplayWindSpeed(100, "fahrenheit")).toBe(62);
  });

  it("handles zero", () => {
    expect(toDisplayWindSpeed(0, "fahrenheit")).toBe(0);
    expect(toDisplayWindSpeed(0, "celsius")).toBe(0);
  });
});

describe("windSpeedUnit", () => {
  it("returns km/h for celsius", () => {
    expect(windSpeedUnit("celsius")).toBe("km/h");
  });

  it("returns mph for fahrenheit", () => {
    expect(windSpeedUnit("fahrenheit")).toBe("mph");
  });
});
