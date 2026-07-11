import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock platform detection
vi.mock("../lib/platform", () => ({
  isNative: vi.fn(),
  getPlatform: vi.fn(),
}));

// Mock Capacitor push notifications
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    requestPermissions: vi.fn(),
    register: vi.fn(),
    addListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));

// Mock web push
vi.mock("../lib/push-notifications", () => ({
  subscribeToPush: vi.fn(),
}));

import { isNative, getPlatform } from "../lib/platform";
import { PushNotifications } from "@capacitor/push-notifications";
import { subscribeToPush } from "../lib/push-notifications";
import { registerForPush } from "../lib/native-push";

describe("registerForPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses Capacitor plugin on native Android", async () => {
    vi.mocked(isNative).mockReturnValue(true);
    vi.mocked(getPlatform).mockReturnValue("android");
    vi.mocked(PushNotifications.requestPermissions).mockResolvedValue({ receive: "granted" });
    vi.mocked(PushNotifications.register).mockResolvedValue();
    
    // Simulate registration callback
    vi.mocked(PushNotifications.addListener).mockImplementation(
      ((event: string, callback: (data: any) => void) => {
        if (event === "registration") {
          setTimeout(() => callback({ value: "fcm-token-123" }), 0);
        }
        return Promise.resolve({ remove: vi.fn() }) as any;
      }) as any
    );

    const result = await registerForPush();
    
    expect(PushNotifications.requestPermissions).toHaveBeenCalled();
    expect(PushNotifications.register).toHaveBeenCalled();
    expect(result).toEqual({
      token: "fcm-token-123",
      platform: "android",
      provider: "fcm",
    });
  });

  it("uses VAPID/web push on web platform", async () => {
    vi.mocked(isNative).mockReturnValue(false);
    
    const mockSubscription = {
      endpoint: "https://example.com/push",
      keys: { p256dh: "key1", auth: "key2" },
      toJSON: () => ({ endpoint: "https://example.com/push", keys: { p256dh: "key1", auth: "key2" } }),
    };
    vi.mocked(subscribeToPush).mockResolvedValue(mockSubscription as any);

    const result = await registerForPush("vapid-public-key");
    
    expect(subscribeToPush).toHaveBeenCalledWith("vapid-public-key");
    expect(result).toEqual({
      endpoint: "https://example.com/push",
      keys: { p256dh: "key1", auth: "key2" },
      provider: "vapid",
      platform: "web",
    });
  });

  it("throws if native permission denied", async () => {
    vi.mocked(isNative).mockReturnValue(true);
    vi.mocked(PushNotifications.requestPermissions).mockResolvedValue({ receive: "denied" });

    await expect(registerForPush()).rejects.toThrow("Push notification permission denied");
  });

  it("returns null if web permission denied", async () => {
    vi.mocked(isNative).mockReturnValue(false);
    vi.mocked(subscribeToPush).mockResolvedValue(null);

    const result = await registerForPush("vapid-key");
    expect(result).toBeNull();
  });
});
