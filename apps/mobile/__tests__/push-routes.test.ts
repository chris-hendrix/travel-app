import { describe, expect, it, vi, beforeEach } from "vitest";
import { pushTarget } from "@/lib/pushRoutes";

describe("pushTarget: the API's web urls onto app routes", () => {
  it("maps / to the landing", () => {
    expect(pushTarget("/")).toBe("/");
  });

  it("maps a trip update to the trip screen", () => {
    expect(pushTarget("/trips?id=abc")).toBe("/trips/detail?id=abc");
  });

  it("maps the itinerary tab to the same trip screen", () => {
    expect(pushTarget("/trips?id=abc&tab=itinerary")).toBe(
      "/trips/detail?id=abc",
    );
  });

  it("degrades the messages tab to the trip screen (no messages surface)", () => {
    expect(pushTarget("/trips?id=abc&tab=messages#discussion")).toBe(
      "/trips/detail?id=abc",
    );
  });

  it("maps a bare /trips to the trips list", () => {
    expect(pushTarget("/trips")).toBe("/trips");
  });

  it("returns null for anything unrecognised", () => {
    expect(pushTarget("/profile")).toBeNull();
    expect(pushTarget("https://evil.example/trips?id=abc")).toBeNull();
    expect(pushTarget(null)).toBeNull();
    expect(pushTarget(":::not a url:::")).toBeNull();
  });

  it("unused import guard", () => {
    expect(vi).toBeDefined();
    expect(beforeEach).toBeDefined();
  });
});
