import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { mockGetPermissions, mockRequestPermissions, mockChannel, mockToken } =
  vi.hoisted(() => ({
    mockGetPermissions: vi.fn(),
    mockRequestPermissions: vi.fn(),
    mockChannel: vi.fn(),
    mockToken: vi.fn(),
  }));

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: mockGetPermissions,
  requestPermissionsAsync: mockRequestPermissions,
  setNotificationChannelAsync: mockChannel,
  getDevicePushTokenAsync: mockToken,
  AndroidImportance: { HIGH: 4 },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

const { mockApiFetch } = vi.hoisted(() => ({ mockApiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch: mockApiFetch }));

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
})();
vi.stubGlobal("localStorage", localStorageMock);

import {
  permissionState,
  registerForPush,
  unregisterPush,
} from "@/lib/push";

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("push client: registration lifecycle", () => {
  it("denied permission registers nothing and returns null", async () => {
    mockGetPermissions.mockResolvedValue({ status: "denied" });
    expect(await registerForPush()).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(await permissionState()).toBe("denied");
  });

  it("granted permission posts the token as provider fcm / platform android", async () => {
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    mockToken.mockResolvedValue({ data: "fcm-token-1" });
    mockApiFetch.mockResolvedValue(undefined);
    expect(await registerForPush()).toBe("fcm-token-1");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/push/subscribe",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(mockApiFetch.mock.calls[0]![1].body);
    expect(body).toMatchObject({
      token: "fcm-token-1",
      provider: "fcm",
      platform: "android",
    });
    expect(mockChannel).toHaveBeenCalledWith(
      "default",
      expect.objectContaining({ name: "Journiful" }),
    );
  });

  it("a failing POST does not throw", async () => {
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    mockToken.mockResolvedValue({ data: "fcm-token-2" });
    mockApiFetch.mockRejectedValue(new Error("offline"));
    expect(await registerForPush()).toBeNull();
  });

  it("unregister deletes the token, never throwing", async () => {
    mockApiFetch.mockRejectedValue(new Error("offline"));
    await expect(unregisterPush("old-token")).resolves.toBeUndefined();
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/push/subscribe",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ provider: "fcm", token: "old-token" }),
      }),
    );
  });

  it("a rotated token deletes the previous row", async () => {
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    mockToken.mockResolvedValue({ data: "new-token" });
    localStorageMock.setItem("journiful.pushToken", "old-token");
    mockApiFetch.mockResolvedValue(undefined);
    expect(await registerForPush()).toBe("new-token");
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    const second = JSON.parse(mockApiFetch.mock.calls[1]![1].body);
    expect(second).toMatchObject({ provider: "fcm", token: "old-token" });
    expect(mockApiFetch.mock.calls[1]![0]).toBe("/push/subscribe");
  });
});
