import { describe, it, expect } from "vitest";
import config from "../../capacitor.config";

describe("capacitor.config", () => {
  it("has correct appId", () => {
    expect(config.appId).toBe("com.journiful.app");
  });

  it("has correct appName", () => {
    expect(config.appName).toBe("Journiful");
  });

  it("points webDir to out/", () => {
    expect(config.webDir).toBe("out");
  });

  it("has CapacitorConfig shape", () => {
    expect(config).toHaveProperty("appId");
    expect(config).toHaveProperty("appName");
    expect(config).toHaveProperty("webDir");
  });

  it("uses server config with cleartext", () => {
    expect(config.server?.cleartext).toBe(true);
  });

  it("server URL defaults to undefined (bundled mode)", () => {
    // When CAPACITOR_LIVE_RELOAD is not set, url should be undefined
    // The config test runs without the env var, so url is undefined
    expect(config.server?.url).toBeUndefined();
  });

  it("has push notification presentation options", () => {
    expect(config.plugins?.PushNotifications?.presentationOptions).toEqual([
      "alert",
      "sound",
    ]);
  });
});
