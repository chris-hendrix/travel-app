import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});
vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return { ...actual, clearToken: vi.fn() };
});
// The unsubscribe is asserted by order, not by call count: it has to
// happen while the session it carries is still valid. `expo-notifications`
// is stubbed so the real `@/lib/push` module can load in node at all.
const order: string[] = [];
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  getDevicePushTokenAsync: vi.fn().mockResolvedValue({ data: null }),
  AndroidImportance: { HIGH: 4 },
}));
vi.mock("@/lib/push", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/push")>();
  return {
    ...actual,
    unregisterPush: vi.fn(async () => {
      order.push("unregister");
    }),
  };
});

import { QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { signOutServer } from "@/lib/queries/auth";
import { performSignOut } from "@/lib/authStore";
import { clearToken } from "@/lib/session";

const mockedApiFetch = vi.mocked(apiFetch);
const mockedClearToken = vi.mocked(clearToken);

function logoutBody() {
  return { success: true as const, message: "Signed out." };
}

beforeEach(() => {
  mockedApiFetch.mockReset();
  mockedClearToken.mockReset();
  order.length = 0;
});

describe("signOutServer", () => {
  it("POSTs /auth/logout", async () => {
    mockedApiFetch.mockResolvedValue(logoutBody());

    const result = await signOutServer();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
    });
    expect(result).toEqual(logoutBody());
  });
});

describe("performSignOut", () => {
  it("tells the server, clears the token, and clears the query cache", async () => {
    mockedApiFetch.mockResolvedValue(logoutBody());
    const client = new QueryClient();
    client.setQueryData(["auth", "me"], { id: "user-1" });
    client.setQueryData(["trips", "list"], [{ id: "trip-1" }]);

    await performSignOut(client);

    expect(mockedApiFetch).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
    });
    expect(mockedClearToken).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["auth", "me"])).toBeUndefined();
    expect(client.getQueryData(["trips", "list"])).toBeUndefined();
  });

  it("still clears the token and the cache when the network fails", async () => {
    mockedApiFetch.mockRejectedValue(new Error("offline"));
    const client = new QueryClient();
    client.setQueryData(["auth", "me"], { id: "user-1" });

    await expect(performSignOut(client)).resolves.toBeUndefined();

    expect(mockedClearToken).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["auth", "me"])).toBeUndefined();
  });

  it("unsubscribes push before revoking the token it needs", async () => {
    // The order is the whole point: `signOutServer` blacklists the
    // bearer, so a DELETE sent after it answers 401 and the subscription
    // row survives — a signed-out phone kept receiving pushes.
    mockedApiFetch.mockImplementation(async (path: string) => {
      order.push(path === "/auth/logout" ? "logout" : "other");
      return logoutBody();
    });

    await performSignOut(new QueryClient());

    expect(order).toEqual(["unregister", "logout"]);
  });
});
