import { describe, it, expect } from "vitest";
import { isNative, getPlatform } from "../lib/platform";

// The Capacitor shell is gone: this app is the web surface only, and the
// Android app is built from apps/mobile. These assertions are the contract
// the remaining call sites rely on — the native branch is never taken.
describe("platform", () => {
  it("is never native", () => {
    expect(isNative()).toBe(false);
  });

  it("is always web", () => {
    expect(getPlatform()).toBe("web");
  });
});
