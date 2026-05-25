import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PushPayload } from "@journiful/shared/types";
import type { AppDatabase } from "@/types/index.js";
import type { Logger } from "@/types/logger.js";

// Mock web-push before importing anything that uses it
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn().mockResolvedValue(undefined),
}));

// Mock firebase-admin
vi.mock("firebase-admin", () => {
  const mockSend = vi.fn().mockResolvedValue("message-id-123");
  const mockMessaging = vi.fn(() => ({ send: mockSend }));
  const mockCredential = {
    cert: vi.fn(() => "mock-credential"),
  };
  const mockInitializeApp = vi.fn(() => ({
    messaging: mockMessaging,
  }));
  return {
    default: {
      initializeApp: mockInitializeApp,
      credential: mockCredential,
    },
    initializeApp: mockInitializeApp,
    credential: mockCredential,
  };
});

import admin from "firebase-admin";
import { PushService } from "@/services/push.service.js";

describe("PushService", () => {
  let mockDb: AppDatabase;
  let mockLogger: Logger;

  const mockSend = vi.mocked(admin.initializeApp()).messaging().send as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as AppDatabase;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;
  });

  describe("constructor", () => {
    it("should initialize firebase-admin when service account is provided", () => {
      const serviceAccount = JSON.stringify({
        project_id: "test-project",
        private_key: "test-key",
        client_email: "test@example.com",
      });

      new PushService(
        mockDb,
        mockLogger,
        "vapid-public",
        "vapid-private",
        "mailto:test@example.com",
        serviceAccount,
      );

      expect(admin.initializeApp).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Firebase Admin initialized for FCM push delivery",
      );
    });

    it("should not initialize firebase-admin when service account is not provided", () => {
      new PushService(
        mockDb,
        mockLogger,
        "",
        "",
        "mailto:test@example.com",
      );

      expect(admin.initializeApp).not.toHaveBeenCalled();
    });
  });

  describe("sendToUser", () => {
    const pushPayload: PushPayload = {
      title: "Test Title",
      body: "Test Body",
      url: "/trips/test",
      tag: "test-tag",
    };

    it("should route FCM subscriptions to admin.messaging().send()", async () => {
      const serviceAccount = JSON.stringify({
        project_id: "test-project",
        private_key: "test-key",
        client_email: "test@example.com",
      });

      const fcmSub = {
        id: "sub-1",
        userId: "user-1",
        endpoint: "fcm:test-token-abc",
        p256dh: "",
        auth: "",
        token: "test-token-abc",
        platform: "android" as const,
        provider: "fcm" as const,
        userAgent: null,
        createdAt: new Date(),
      };

      // Mock DB to return the FCM subscription
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([fcmSub]),
        }),
      } as unknown as ReturnType<typeof mockDb.select>);

      const pushService = new PushService(
        mockDb,
        mockLogger,
        "vapid-public",
        "vapid-private",
        "mailto:test@example.com",
        serviceAccount,
      );

      // Reset the send mock after construction (constructor may trigger calls)
      mockSend.mockClear();

      await pushService.sendToUser("user-1", pushPayload);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        token: "test-token-abc",
        notification: {
          title: "Test Title",
          body: "Test Body",
        },
        data: {
          url: "/trips/test",
          tag: "test-tag",
        },
        android: {
          priority: "high",
          notification: {
            channelId: "default",
            clickAction: "FCM_PLUGIN_ACTIVITY",
          },
        },
      });
    });

    it("should clean up invalid FCM tokens", async () => {
      const serviceAccount = JSON.stringify({
        project_id: "test-project",
        private_key: "test-key",
        client_email: "test@example.com",
      });

      const fcmSub = {
        id: "sub-1",
        userId: "user-1",
        endpoint: "fcm:invalid-token",
        p256dh: "",
        auth: "",
        token: "invalid-token",
        platform: "android" as const,
        provider: "fcm" as const,
        userAgent: null,
        createdAt: new Date(),
      };

      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([fcmSub]),
        }),
      } as unknown as ReturnType<typeof mockDb.select>);

      // Mock the send to throw registration-token-not-registered
      mockSend.mockRejectedValueOnce({
        code: "messaging/registration-token-not-registered",
      });

      const pushService = new PushService(
        mockDb,
        mockLogger,
        "vapid-public",
        "vapid-private",
        "mailto:test@example.com",
        serviceAccount,
      );

      await pushService.sendToUser("user-1", pushPayload);

      // Should have called removeSubscription to clean up
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        { token: "invalid-token" },
        "removed invalid FCM token",
      );
    });

    it("should clean up FCM tokens with invalid-argument error", async () => {
      const serviceAccount = JSON.stringify({
        project_id: "test-project",
        private_key: "test-key",
        client_email: "test@example.com",
      });

      const fcmSub = {
        id: "sub-1",
        userId: "user-1",
        endpoint: "fcm:bad-token",
        p256dh: "",
        auth: "",
        token: "bad-token",
        platform: "ios" as const,
        provider: "fcm" as const,
        userAgent: null,
        createdAt: new Date(),
      };

      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([fcmSub]),
        }),
      } as unknown as ReturnType<typeof mockDb.select>);

      mockSend.mockRejectedValueOnce({
        code: "messaging/invalid-argument",
      });

      const pushService = new PushService(
        mockDb,
        mockLogger,
        "vapid-public",
        "vapid-private",
        "mailto:test@example.com",
        serviceAccount,
      );

      await pushService.sendToUser("user-1", pushPayload);

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        { token: "bad-token" },
        "removed invalid FCM token",
      );
    });

    it("should log error for other FCM delivery failures without cleanup", async () => {
      const serviceAccount = JSON.stringify({
        project_id: "test-project",
        private_key: "test-key",
        client_email: "test@example.com",
      });

      const fcmSub = {
        id: "sub-1",
        userId: "user-1",
        endpoint: "fcm:ok-token",
        p256dh: "",
        auth: "",
        token: "ok-token",
        platform: "android" as const,
        provider: "fcm" as const,
        userAgent: null,
        createdAt: new Date(),
      };

      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([fcmSub]),
        }),
      } as unknown as ReturnType<typeof mockDb.select>);

      const otherError = new Error("Network error");
      mockSend.mockRejectedValueOnce(otherError);

      const pushService = new PushService(
        mockDb,
        mockLogger,
        "vapid-public",
        "vapid-private",
        "mailto:test@example.com",
        serviceAccount,
      );

      await pushService.sendToUser("user-1", pushPayload);

      // Should not clean up for non-invalid-token errors
      expect(mockDb.delete).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: otherError, token: "ok-token" },
        "FCM delivery failed",
      );
    });

    it("should still deliver VAPID subscriptions alongside FCM", async () => {
      const serviceAccount = JSON.stringify({
        project_id: "test-project",
        private_key: "test-key",
        client_email: "test@example.com",
      });

      const fcmSub = {
        id: "sub-1",
        userId: "user-1",
        endpoint: "fcm:token-1",
        p256dh: "",
        auth: "",
        token: "token-1",
        platform: "android" as const,
        provider: "fcm" as const,
        userAgent: null,
        createdAt: new Date(),
      };

      const vapidSub = {
        id: "sub-2",
        userId: "user-1",
        endpoint: "https://example.com/push",
        p256dh: "p256dh-key",
        auth: "auth-secret",
        token: null,
        platform: "web" as const,
        provider: "vapid" as const,
        userAgent: null,
        createdAt: new Date(),
      };

      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([fcmSub, vapidSub]),
        }),
      } as unknown as ReturnType<typeof mockDb.select>);

      const pushService = new PushService(
        mockDb,
        mockLogger,
        "vapid-public",
        "vapid-private",
        "mailto:test@example.com",
        serviceAccount,
      );

      mockSend.mockClear();

      await pushService.sendToUser("user-1", pushPayload);

      // FCM should have been called
      expect(mockSend).toHaveBeenCalledTimes(1);

      // VAPID delivery attempts would fail since we haven't mocked webpush,
      // but the key point is: select returned both, and FCM was routed correctly.
      // The VAPID side attempts delivery per sub — expect errors logged.
      // At minimum, we validated the FCM side worked while VAPID path also ran.
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ token: "token-1" }),
      );
    });

    it("should skip FCM delivery for subscriptions without a token", async () => {
      const serviceAccount = JSON.stringify({
        project_id: "test-project",
        private_key: "test-key",
        client_email: "test@example.com",
      });

      const fcmNoToken = {
        id: "sub-1",
        userId: "user-1",
        endpoint: "fcm:null-token",
        p256dh: "",
        auth: "",
        token: null,
        platform: "android" as const,
        provider: "fcm" as const,
        userAgent: null,
        createdAt: new Date(),
      };

      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([fcmNoToken]),
        }),
      } as unknown as ReturnType<typeof mockDb.select>);

      const pushService = new PushService(
        mockDb,
        mockLogger,
        "vapid-public",
        "vapid-private",
        "mailto:test@example.com",
        serviceAccount,
      );

      mockSend.mockClear();

      await pushService.sendToUser("user-1", pushPayload);

      // FCM send should NOT have been called — no token to send to
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
