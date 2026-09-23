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
});
