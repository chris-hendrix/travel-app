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
 * Two things have to be true before the cache is emptied, and this test
 * pins both ends of it. The **leave** removes the observers: the
 * session's screens are still mounted while they are being signed out
 * (the profile dialog covers the trips list rather than replacing it),
 * and an emptied entry is built again — empty, pending, and fetched — by
 * the next render of any observer still on it. A flip of the session's
 * state alone re-renders `useAuth`'s consumers and nothing else, so the
 * leaving has to be a navigation out of those screens. The **clear** then
 * runs while the bearer still answers, so a render that slips through
 * issues an authenticated request instead of the anonymous one that came
 * back 401 `Invalid or expired token` into the screen's error boundary —
 * and nothing of the previous account's is left in memory for a Back
 * during `performSignOut`'s round trip.
 *
 * The reset and the way out are a caller's own steps, so they arrive here
 * as callbacks and are asserted by order against everything that must come
 * after them: the clear (still ahead of the token), the push unsubscribe
 * (still authenticated, and it has to stay that way), the logout, and the
 * token drop. The 401 recovery listener signs out through the same seam,
 * so this is the one order to pin rather than two.
 */
describe("the session leaves before the token goes", () => {
  it("resets the session's state and its screens, clears the cache, then drops the token", async () => {
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

    // `clear` twice, and the first one is the point: the cache is emptied
    // while the bearer still answers, so a late render cannot 401, and the
    // second is `performSignOut`'s backstop for whatever that render wrote.
    expect(order).toEqual([
      "leave",
      "leaveRoutes",
      "clear",
      "unregister",
      "logout",
      "clearToken",
      "clear",
    ]);
  });

  it("the recovery path's two-argument call signs out without leaving", async () => {
    // The 401 listener passes no `leaveRoutes` on purpose: the auth flow's
    // own guards decide where a signed-out reader belongs, and `dismissAll`
    // plus `/login` would overrule them (`/complete-profile` sends them to
    // the landing). So a call with two arguments has to do the whole of
    // sign-out and route nothing — the absence of a `leaveRoutes` step in
    // the sequence below is the assertion. The call site's own shape is
    // pinned in `session-end-wiring.test.ts`.
    mockedApiFetch.mockImplementation(async (path: string) => {
      order.push(path === "/auth/logout" ? "logout" : "other");
      return logoutBody();
    });
    mockedClearToken.mockImplementation(async () => {
      order.push("clearToken");
    });
    const client = new QueryClient();
    const clear = client.clear.bind(client);
    vi.spyOn(client, "clear").mockImplementation(() => {
      order.push("clear");
      clear();
    });

    await endSession(client, () => {
      order.push("leave");
    });

    expect(order).toEqual([
      "leave",
      "clear",
      "unregister",
      "logout",
      "clearToken",
      "clear",
    ]);
  });
});
