import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

// The order is the whole contract of this module, so it is recorded rather
// than inferred from call counts: `apiFetch` first (a failed delete must
// leave the session intact so the person can try again), then the token
// drop, then the cache clear. A reverse of the last two still clears both,
// and would still look right to anyone reading the calls.
const order: string[] = [];
vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return {
    ...actual,
    clearToken: vi.fn(async () => {
      order.push("clear-token");
    }),
  };
});
// `expo-notifications` is stubbed so the real `@/lib/push` module can load
// in node at all. Account deletion must never unsubscribe: the DELETE above
// has already dropped the push subscription rows server-side, so the call
// would only be a request that 401s.
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
import { ApiError, apiFetch } from "@/lib/api";
import { deleteAccount } from "@/lib/account";
import { clearToken } from "@/lib/session";
import { unregisterPush } from "@/lib/push";

const mockedApiFetch = vi.mocked(apiFetch);
const mockedClearToken = vi.mocked(clearToken);
const mockedUnregisterPush = vi.mocked(unregisterPush);

/** A client with one session's worth of data in it, and a record of when
 *  it was emptied. Overwriting the instance method rather than spying keeps
 *  the real clear's behaviour (the assertions below read the cache too). */
function seededClient() {
  const client = new QueryClient();
  client.setQueryData(["auth", "me"], { id: "user-1" });
  client.setQueryData(["trips", "list"], [{ id: "trip-1" }]);
  const clear = client.clear.bind(client);
  client.clear = () => {
    order.push("clear-cache");
    clear();
  };
  return client;
}

beforeEach(() => {
  order.length = 0;
  mockedApiFetch.mockReset();
  mockedClearToken.mockReset();
});

describe("deleteAccount", () => {
  it("DELETEs /users/me with the confirm guard the route requires", async () => {
    mockedApiFetch.mockImplementation(async (path: string) => {
      order.push(path);
      return { success: true as const };
    });

    await deleteAccount(seededClient());

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/users/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "delete" }),
    });
  });

  it("drops the session before the caller navigates, in that order", async () => {
    // `DELETE`, then the token, then the cache. The token before the cache
    // because the cache is what the next screen would otherwise read while
    // it still believes there is a session; the delete first because a
    // failed one must leave both intact.
    mockedApiFetch.mockImplementation(async (path: string) => {
      order.push(path);
      return { success: true as const };
    });
    const client = seededClient();

    await deleteAccount(client);

    expect(order).toEqual(["/users/me", "clear-token", "clear-cache"]);
    expect(mockedClearToken).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["auth", "me"])).toBeUndefined();
    expect(client.getQueryData(["trips", "list"])).toBeUndefined();
  });

  it("never unsubscribes push, which the deletion has already done", async () => {
    mockedApiFetch.mockResolvedValue({ success: true as const });

    await deleteAccount(seededClient());

    expect(mockedUnregisterPush).not.toHaveBeenCalled();
  });

  it("resolves nothing: the caller navigates, not this", async () => {
    mockedApiFetch.mockResolvedValue({ success: true as const });

    await expect(deleteAccount(seededClient())).resolves.toBeUndefined();
  });

  it("keeps the whole session when the delete fails", async () => {
    // The retry is the point. A failed delete that signed the person out
    // would leave them unable to try again, and unable to get back in.
    mockedApiFetch.mockRejectedValue(
      new ApiError(429, "Too many tries", "RATE_LIMIT_EXCEEDED"),
    );
    const client = seededClient();

    await expect(deleteAccount(client)).rejects.toBeInstanceOf(ApiError);

    expect(order).toEqual([]);
    expect(mockedClearToken).not.toHaveBeenCalled();
    expect(client.getQueryData(["auth", "me"])).toEqual({ id: "user-1" });
    expect(client.getQueryData(["trips", "list"])).toEqual([{ id: "trip-1" }]);
  });

  it("survives having no client to clear", async () => {
    // Bare node renders have no QueryClientProvider above the store, and
    // the token drop is the part that must not be optional: it is the one
    // thing keeping a deleted account's bearer out of storage.
    mockedApiFetch.mockImplementation(async (path: string) => {
      order.push(path);
      return { success: true as const };
    });

    await expect(deleteAccount()).resolves.toBeUndefined();

    expect(order).toEqual(["/users/me", "clear-token"]);
  });
});