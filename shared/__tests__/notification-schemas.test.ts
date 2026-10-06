// Tests for notification validation schemas

import { describe, it, expect } from "vitest";
import {
  notificationPreferencesSchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
} from "../schemas/index.js";

describe("notificationPreferencesSchema", () => {
  it("should accept valid preferences with all fields", () => {
    const preferences = {
      dailyItinerary: false,
      tripMessages: true,
    };

    expect(() =>
      notificationPreferencesSchema.parse(preferences),
    ).not.toThrow();
  });

  it("should accept all-false preferences", () => {
    const preferences = {
      dailyItinerary: false,
      tripMessages: false,
    };

    expect(() =>
      notificationPreferencesSchema.parse(preferences),
    ).not.toThrow();
  });

  it("should accept all-true preferences", () => {
    const preferences = {
      dailyItinerary: true,
      tripMessages: true,
    };

    expect(() =>
      notificationPreferencesSchema.parse(preferences),
    ).not.toThrow();
  });

  it("should reject missing fields", () => {
    const invalidPreferences = [
      { tripMessages: true }, // Missing dailyItinerary
      { dailyItinerary: true }, // Missing tripMessages
      {}, // Missing all fields
    ];

    invalidPreferences.forEach((prefs) => {
      const result = notificationPreferencesSchema.safeParse(prefs);
      expect(result.success).toBe(false);
    });
  });

  it("should reject non-boolean values", () => {
    const invalidPreferences = [
      { dailyItinerary: 1, tripMessages: true },
      { dailyItinerary: true, tripMessages: null },
    ];

    invalidPreferences.forEach((prefs) => {
      const result = notificationPreferencesSchema.safeParse(prefs);
      expect(result.success).toBe(false);
    });
  });
});

describe("pushSubscribeSchema — apns", () => {
  it("accepts an apns subscription for ios", () => {
    const result = pushSubscribeSchema.safeParse({
      token: "apns-device-token",
      provider: "apns",
      platform: "ios",
    });
    expect(result.success).toBe(true);
  });

  it("still accepts the legacy vapid payload and infers the provider", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://push.example.com/sub",
      keys: { p256dh: "p", auth: "a" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider).toBe("vapid");
      expect(result.data.platform).toBe("web");
    }
  });

  it("rejects apns on android", () => {
    const result = pushSubscribeSchema.safeParse({
      token: "apns-device-token",
      provider: "apns",
      platform: "android",
    });
    expect(result.success).toBe(false);
  });
});

describe("pushUnsubscribeSchema — apns", () => {
  it("accepts an apns unsubscription", () => {
    const result = pushUnsubscribeSchema.safeParse({
      provider: "apns",
      token: "apns-device-token",
    });
    expect(result.success).toBe(true);
  });
});
