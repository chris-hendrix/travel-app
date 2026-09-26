import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const {
  mockGetPermissions,
  mockRequestPermissions,
  mockChannel,
  mockDeleteChannel,
  mockToken,
} = vi.hoisted(() => ({
  mockGetPermissions: vi.fn(),
  mockRequestPermissions: vi.fn(),
  mockChannel: vi.fn(),
  mockDeleteChannel: vi.fn(),
  mockToken: vi.fn(),
}));

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: mockGetPermissions,
  requestPermissionsAsync: mockRequestPermissions,
  setNotificationChannelAsync: mockChannel,
  deleteNotificationChannelAsync: mockDeleteChannel,
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
  askForPush,
  ensureChannel,
  permissionState,
  registerForPush,
  unregisterPush,
} from "@/lib/push";
beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  mockDeleteChannel.mockResolvedValue(undefined);
  mockChannel.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("push client: the Android channel", () => {
  it("creates the addressed channel with a sound and a vibration", async () => {
    await ensureChannel();
    expect(mockChannel).toHaveBeenCalledWith(
      "journiful-default",
      expect.objectContaining({
        name: "Journiful",
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        importance: 4,
      }),
    );
  });

  it("deletes the pre-rename channel rather than reusing it", async () => {
    // Android restores a recreated channel's frozen settings — the device
    // showed a deleted-and-recreated channel come back without a vibration
    // pattern — so the old id is retired, not migrated.
    await ensureChannel();
    expect(mockDeleteChannel).toHaveBeenCalledWith("default");
    expect(mockChannel).toHaveBeenCalledWith(
      "journiful-default",
      expect.anything(),
    );
    expect(mockChannel).not.toHaveBeenCalledWith("default", expect.anything());
  });

  it("is a no-op off Android", async () => {
    const { Platform } = await import("react-native");
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    try {
      await ensureChannel();
      expect(mockChannel).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    }
  });
});

describe("push client: registration lifecycle", () => {
  it("denied permission registers nothing and returns null", async () => {
    mockGetPermissions.mockResolvedValue({ status: "denied" });
    expect(await registerForPush()).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
    // Never asked, so the screen still offers the ask: "undetermined" is
    // the honest answer even though the OS says denied (see
    // `permissionState`).
    expect(await permissionState()).toBe("undetermined");
  });

  it("does not ask: a not-yet-asked permission registers nothing", async () => {
    // The device bug: signing in fired the OS prompt, it never appeared,
    // Android recorded a denial, and the one-shot ask was spent before the
    // person had opened the notifications screen.
    mockGetPermissions.mockResolvedValue({
      status: "denied",
      canAskAgain: true,
    });
    expect(await registerForPush()).toBeNull();
    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
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
      "journiful-default",
      expect.objectContaining({ name: "Journiful" }),
    );
  });

  it("a first-run Android denial is 'not yet asked', not 'turned off'", async () => {
    // Android answers `denied` for a permission nobody has requested;
    // the block must offer the ask, not claim the person turned it off.
    mockGetPermissions.mockResolvedValue({ status: "denied", canAskAgain: true });
    expect(await permissionState()).toBe("undetermined");
  });

  it("stays 'not yet asked' even when the OS reports it cannot ask again", async () => {
    // The device reported `{"status":"denied","canAskAgain":false,"asked":true}`
    // on a fresh install, so `canAskAgain: false` cannot be read as "off"
    // — that is the lie this whole flag exists to avoid.
    mockGetPermissions.mockResolvedValue({
      status: "denied",
      canAskAgain: false,
    });
    expect(await permissionState()).toBe("undetermined");
  });

  it("after the ask, a denial is a denial", async () => {
    localStorageMock.setItem("journiful.pushAsked", "1");
    mockGetPermissions.mockResolvedValue({ status: "denied", canAskAgain: true });
    expect(await permissionState()).toBe("denied");
  });

  it("an answered ask that will not be asked again is a denial", async () => {
    localStorageMock.setItem("journiful.pushAsked", "1");
    mockGetPermissions.mockResolvedValue({
      status: "denied",
      canAskAgain: false,
    });
    expect(await permissionState()).toBe("denied");
  });

  it("askForPush asks, then registers", async () => {
    // The OS answers "denied" before the ask and "granted" after it, which
    // is what Android actually does on a first run.
    mockGetPermissions
      .mockResolvedValueOnce({ status: "denied", canAskAgain: true })
      .mockResolvedValue({ status: "granted" });
    mockRequestPermissions.mockResolvedValue({ status: "granted" });
    mockToken.mockResolvedValue({ data: "fcm-token-asked" });
    mockApiFetch.mockResolvedValue(undefined);

    expect(await askForPush()).toBe("fcm-token-asked");
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(localStorageMock.getItem("journiful.pushAsked")).toBe("1");
  });

  it("askForPush registers without prompting when permission is already granted", async () => {
    mockGetPermissions.mockResolvedValue({ status: "granted" });
    mockToken.mockResolvedValue({ data: "fcm-token-granted" });
    mockApiFetch.mockResolvedValue(undefined);

    expect(await askForPush()).toBe("fcm-token-granted");
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it("askForPush remembers a denial and registers nothing", async () => {
    mockGetPermissions.mockResolvedValue({ status: "denied", canAskAgain: true });
    mockRequestPermissions.mockResolvedValue({ status: "denied" });

    expect(await askForPush()).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(localStorageMock.getItem("journiful.pushAsked")).toBe("1");
    expect(await permissionState()).toBe("denied");
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
