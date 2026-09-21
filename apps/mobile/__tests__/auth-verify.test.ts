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
import {
  destinationForRequiresProfile,
  verifyCode,
} from "@/lib/queries/auth";
import { setToken } from "@/lib/session";

const mockedApiFetch = vi.mocked(apiFetch);
const mockedSetToken = vi.mocked(setToken);

function verifyBody(requiresProfile: boolean) {
  return {
    success: true as const,
    user: {
      id: "user-1",
      phoneNumber: "+15551234567",
      displayName: requiresProfile ? "" : "Ada",
      profilePhotoUrl: null,
      timezone: null,
      handles: null,
      temperatureUnit: null,
      smsConsentAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    token: "jwt-token-abc",
    requiresProfile,
  };
}

beforeEach(() => {
  mockedApiFetch.mockReset();
  mockedSetToken.mockReset();
});

describe("verifyCode", () => {
  it("POSTs /auth/verify-code with {phoneNumber, code, smsConsent}", async () => {
    mockedApiFetch.mockResolvedValue(verifyBody(false));

    await verifyCode({
      phoneNumber: "+15551234567",
      code: "123456",
      smsConsent: true,
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = mockedApiFetch.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(path).toBe("/auth/verify-code");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(init?.body))).toEqual({
      phoneNumber: "+15551234567",
      code: "123456",
      smsConsent: true,
    });
  });

  it("stores the token and exposes user + requiresProfile", async () => {
    mockedApiFetch.mockResolvedValue(verifyBody(false));

    const result = await verifyCode({
      phoneNumber: "+15551234567",
      code: "123456",
      smsConsent: true,
    });

    expect(mockedSetToken).toHaveBeenCalledTimes(1);
    expect(mockedSetToken).toHaveBeenCalledWith("jwt-token-abc");
    expect(result.user.id).toBe("user-1");
    expect(result.requiresProfile).toBe(false);
  });

  it("exposes requiresProfile: true for a first-time user", async () => {
    mockedApiFetch.mockResolvedValue(verifyBody(true));

    const result = await verifyCode({
      phoneNumber: "+15559876543",
      code: "123456",
      smsConsent: true,
    });

    expect(result.requiresProfile).toBe(true);
    expect(mockedSetToken).toHaveBeenCalledWith("jwt-token-abc");
  });

  it("never reaches the network for a malformed code", async () => {
    await expect(
      verifyCode({
        phoneNumber: "+15551234567",
        code: "nope",
        smsConsent: true,
      }),
    ).rejects.toThrow();
    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(mockedSetToken).not.toHaveBeenCalled();
  });

  it("never stores a token when the network fails", async () => {
    mockedApiFetch.mockRejectedValue(new Error("offline"));

    await expect(
      verifyCode({
        phoneNumber: "+15551234567",
        code: "123456",
        smsConsent: true,
      }),
    ).rejects.toThrow("offline");
    expect(mockedSetToken).not.toHaveBeenCalled();
  });
});

describe("verify routing contract", () => {
  it("sends first-time users to complete-profile and the rest to trips", () => {
    expect(destinationForRequiresProfile(true)).toBe("/complete-profile");
    expect(destinationForRequiresProfile(false)).toBe("/trips");
  });
});
