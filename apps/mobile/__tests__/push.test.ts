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

  it("a first-run Android denial is 'not yet asked', not 'turned off'", async () => {
    // Android answers `denied` for a permission nobody has requested;
    // the block must offer the ask, not claim the person turned it off.
    mockGetPermissions.mockResolvedValue({ status: "denied", canAskAgain: true });
    expect(await permissionState()).toBe("undetermined");
  });

  it("after the ask, a denial is a denial", async () => {
    localStorageMock.setItem("journiful.pushAsked", "1");
    mockGetPermissions.mockResolvedValue({ status: "denied", canAskAgain: true });
    expect(await permissionState()).toBe("denied");
  });

  it("an OS that will not ask again is a denial whatever the flag says", async () => {
    mockGetPermissions.mockResolvedValue({
      status: "denied",
      canAskAgain: false,
    });
    expect(await permissionState()).toBe("denied");
  });

  it("the first register asks, and the second does not", async () => {
    mockGetPermissions.mockResolvedValue({ status: "denied", canAskAgain: true });
    mockRequestPermissions.mockResolvedValue({ status: "granted" });
    mockToken.mockResolvedValue({ data: "fcm-token-first" });
    mockApiFetch.mockResolvedValue(undefined);
    expect(await registerForPush()).toBe("fcm-token-first");
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);

    // Second launch: the OS still says denied but the flag is set, so
    // the app must not re-prompt.
    mockRequestPermissions.mockClear();
    await registerForPush();
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it("a failing POST does not throw", async () => {
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    mockToken.mockResolvedValue({ data: "fcm-token-2" });
    mockApiFetch.mockRejectedValue(new Error("offline"));
    expect(await registerForPush()).toBeNull();
  });

  it("unregister deletes the token, never throwing", async () => {
    mockApiFetch.mockRejectedValue(new Error("offline"));
    mockToken.mockResolvedValue({ data: "old-token" });
    await expect(unregisterPush("old-token")).resolves.toBeUndefined();
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/push/subscribe",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ provider: "fcm", token: "old-token" }),
      }),
    );
  });

  it("unregister deletes the OS token as well as the stored one", async () => {
    // The device case: the stored value disagreed with what the device
    // had registered, and sign-out deleted nothing.
    mockToken.mockResolvedValue({ data: "os-token" });
    localStorageMock.setItem("journiful.pushToken", "stored-token");
    mockApiFetch.mockResolvedValue(undefined);
    await unregisterPush();
    const deleted = mockApiFetch.mock.calls.map((call) =>
      JSON.parse(call[1].body).token,
    );
    expect(new Set(deleted)).toEqual(new Set(["os-token", "stored-token"]));
    expect(localStorageMock.getItem("journiful.pushToken")).toBeNull();
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
