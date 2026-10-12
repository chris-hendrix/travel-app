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
import { endSession, performSignOut } from "@/lib/authStore";
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

/**
 * The whole of sign-out as one sequence, because the order is the only
 * thing standing between the person and a 401 they never asked for.
 *
 * `performSignOut` empties the query cache, and an emptied entry is
 * built again — empty, pending, and fetched — by the next render of any
 * observer still mounted. The session's screens are still mounted while
 * they are being signed out (the profile dialog covers the trips list
 * rather than replacing it), so the render that reset the session's
 * state is the render that must not come after the clear. That request
 * carries no token — the store was dropped a line earlier — so it
 * answers 401 `Invalid or expired token`, and the screen's error
 * boundary catches it: a dev build shows the API's sentence over the
 * sign-out.
 *
 * The reset and the way out of the session's screens are a caller's own
 * steps, so they arrive here as callbacks and are asserted by order
 * against everything that must come after them: the push unsubscribe
 * (still authenticated, and it has to stay that way), the logout, the
 * token drop, and the clear. The state flip alone is not the fix and this
 * is where that shows: a flip re-renders `useAuth`'s consumers and nothing
 * else, so the screens behind the dialog stay mounted — the leaving has to
 * be a navigation out of them. The 401 recovery listener signs out through
 * the same seam, so this is the one order to pin rather than two.
 */
describe("the session leaves before the token goes", () => {
  it("resets the session's state and its screens before the token and the cache are dropped", async () => {
    mockedApiFetch.mockImplementation(async (path: string) => {
      order.push(path === "/auth/logout" ? "logout" : "other");
      return logoutBody();
    });
    // The token store and the cache clear report themselves too, so the
    // assertion is the sequence rather than any one call's count.
    mockedClearToken.mockImplementation(async () => {
      order.push("clearToken");
    });
    const client = new QueryClient();
    const clear = client.clear.bind(client);
    vi.spyOn(client, "clear").mockImplementation(() => {
      order.push("clear");
      clear();
    });

    await endSession(
      client,
      () => {
        order.push("leave");
      },
      () => {
        order.push("leaveRoutes");
      },
    );

    expect(order).toEqual([
      "leave",
      "leaveRoutes",
      "unregister",
      "logout",
      "clearToken",
      "clear",
    ]);
  });
});
