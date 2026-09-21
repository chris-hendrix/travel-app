import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});
vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return { ...actual, setToken: vi.fn() };
});

import { apiFetch } from "@/lib/api";
import { completeProfile, meOptions } from "@/lib/queries/auth";
import { setToken } from "@/lib/session";

const mockedApiFetch = vi.mocked(apiFetch);
const mockedSetToken = vi.mocked(setToken);

function apiUser(displayName: string) {
  return {
    id: "user-1",
    phoneNumber: "+15551234567",
    displayName,
    profilePhotoUrl: null,
    timezone: "Europe/Berlin",
    handles: null,
    temperatureUnit: null,
    smsConsentAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

beforeEach(() => {
  mockedApiFetch.mockReset();
  mockedSetToken.mockReset();
});

describe("completeProfile", () => {
  it("POSTs /auth/complete-profile, stores the refreshed token, and reads the user back from GET /auth/me", async () => {
    mockedApiFetch
      .mockResolvedValueOnce({
        success: true as const,
        user: apiUser("Ada"),
        token: "refreshed-jwt",
      })
      .mockResolvedValueOnce({
        success: true as const,
        user: apiUser("Ada"),
      });

    const profile = await completeProfile({ displayName: "Ada Lovelace" });

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    const [postPath, postInit] = mockedApiFetch.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(postPath).toBe("/auth/complete-profile");
    expect(postInit).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(postInit?.body))).toEqual({
      displayName: "Ada Lovelace",
    });

    expect(mockedSetToken).toHaveBeenCalledTimes(1);
    expect(mockedSetToken).toHaveBeenCalledWith("refreshed-jwt");

    const [getPath] = mockedApiFetch.mock.calls[1] as [string];
    expect(getPath).toBe("/auth/me");

    // One source of truth: the exposed user is the `me` row, mapped
    // through `toProfile` (flat handles, timezone, photo).
    expect(profile.displayName).toBe("Ada");
    expect(profile.phoneNumber).toBe("+15551234567");
    expect(profile.timezone).toBe("Europe/Berlin");
  });

  it("never reaches the network for a too-short display name", async () => {
    await expect(completeProfile({ displayName: "Al" })).rejects.toThrow();
    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(mockedSetToken).not.toHaveBeenCalled();
  });

  it("never stores a token when the network fails", async () => {
    mockedApiFetch.mockRejectedValue(new Error("offline"));

    await expect(
      completeProfile({ displayName: "Ada Lovelace" }),
    ).rejects.toThrow("offline");
    expect(mockedSetToken).not.toHaveBeenCalled();
  });
});

describe("meOptions", () => {
  it("queryFn GETs /auth/me and maps the row through toProfile", async () => {
    mockedApiFetch.mockResolvedValue({
      success: true as const,
      user: apiUser("Ada"),
    });

    const options = meOptions();
    expect(options.queryKey).toContain("me");
    const profile = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/auth/me");
    expect(profile.displayName).toBe("Ada");
    expect(profile.phoneNumber).toBe("+15551234567");
  });
});
