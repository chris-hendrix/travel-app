import { describe, it, expect, vi } from "vitest";

// Mock @capacitor/core before importing platform
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn(),
  },
}));

import { isNative, getPlatform } from "../lib/platform";
import { Capacitor } from "@capacitor/core";

describe("isNative", () => {
  it("returns true when Capacitor reports native platform", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    expect(isNative()).toBe(true);
  });

  it("returns false when Capacitor reports not native", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    expect(isNative()).toBe(false);
  });
});

describe("getPlatform", () => {
  it('returns "android" on Android native', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.getPlatform).mockReturnValue("android");
    expect(getPlatform()).toBe("android");
  });

  it('returns "ios" on iOS native', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
    expect(getPlatform()).toBe("ios");
  });

  it('returns "web" when not native', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    expect(getPlatform()).toBe("web");
  });
});
