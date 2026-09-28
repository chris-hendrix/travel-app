import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A test-only probe: `react-dom` ships no server types in this
// workspace, so the renderer is loaded through `require` (typed as
// `any`) instead of an import. Effects never fire under
// `renderToString`, which is exactly what the first test wants — the
// status before the restore resolves.
const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});
vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();
  return { ...actual, getToken: vi.fn(), clearToken: vi.fn() };
});

import { ApiError, apiFetch } from "@/lib/api";
import {
  AuthProvider,
  providerPatchFromRestore,
  restoreSession,
  useAuth,
  type RestoreResult,
} from "@/lib/authStore";
import { clearToken, getToken } from "@/lib/session";

const mockedApiFetch = vi.mocked(apiFetch);
const mockedGetToken = vi.mocked(getToken);
const mockedClearToken = vi.mocked(clearToken);

function meBody(
  displayName: string,
  extra: Record<string, unknown> = {},
) {
  return {
    success: true as const,
    user: {
      id: "user-1",
      phoneNumber: "+15551234567",
      displayName,
      profilePhotoUrl: null,
      timezone: null,
      handles: null,
      temperatureUnit: null,
      smsConsentAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    ...extra,
  };
}

beforeEach(() => {
  mockedApiFetch.mockReset();
  mockedGetToken.mockReset();
  mockedClearToken.mockReset();
});

describe("restoreSession", () => {
  it("reports restoring first, then signed-in with the me user when a token is present", async () => {
    mockedGetToken.mockResolvedValue("jwt-token-abc");
    mockedApiFetch.mockResolvedValue(meBody("Ada"));

    let seen: string | null = null;
    function Probe() {
      seen = useAuth().status;
      return null;
    }
    renderToString(
      createElement(AuthProvider, null, createElement(Probe)),
    );
    expect(seen).toBe("restoring");

    const result = await restoreSession();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/auth/me");
    expect(result.status).toBe("signed-in");
    expect(result.user).toMatchObject({
      id: "user-1",
      phoneNumber: "+15551234567",
      displayName: "Ada",
      profileComplete: true,
    });
  });

  it("clears the token and reports signed-out on a 401", async () => {
    mockedGetToken.mockResolvedValue("stale-token");
    mockedApiFetch.mockRejectedValue(
      new ApiError(401, "Sign in again", "UNAUTHORIZED"),
    );

    const result = await restoreSession();

    expect(mockedClearToken).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("signed-out");
    expect(result.user).toBeNull();
  });

  it("is signed-out immediately when there is no token, without touching the network", async () => {
    mockedGetToken.mockResolvedValue(null);

    const result = await restoreSession();

    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(mockedClearToken).not.toHaveBeenCalled();
    expect(result.status).toBe("signed-out");
    expect(result.user).toBeNull();
    expect(result.isAdmin).toBe(false);
    expect(result.impersonating).toBeNull();
  });

  it("resolves isAdmin and the impersonating pair off an admin body", async () => {
    mockedGetToken.mockResolvedValue("jwt-token-abc");
    mockedApiFetch.mockResolvedValue(
      meBody("Ada", {
        isAdmin: true,
        impersonating: true,
        impersonatingUser: { id: "user-9", displayName: "Bob" },
      }),
    );

    const result = await restoreSession();

    expect(result.status).toBe("signed-in");
    if (result.status !== "signed-in") throw new Error("expected signed-in");
    expect(result.isAdmin).toBe(true);
    expect(result.impersonating).toEqual({ id: "user-9", displayName: "Bob" });
  });

  it("normalizes an ordinary session (no optional keys) to not-admin, not impersonating", async () => {
    mockedGetToken.mockResolvedValue("jwt-token-abc");
    mockedApiFetch.mockResolvedValue(meBody("Ada"));

    const result = await restoreSession();

    expect(result.status).toBe("signed-in");
    if (result.status !== "signed-in") throw new Error("expected signed-in");
    expect(result.isAdmin).toBe(false);
    expect(result.impersonating).toBeNull();
  });

  it("never builds a half-filled impersonation without its user", async () => {
    mockedGetToken.mockResolvedValue("jwt-token-abc");
    mockedApiFetch.mockResolvedValue(meBody("Ada", { impersonating: true }));

    const result = await restoreSession();

    expect(result.status).toBe("signed-in");
    if (result.status !== "signed-in") throw new Error("expected signed-in");
    expect(result.impersonating).toBeNull();
  });
});

describe("providerPatchFromRestore", () => {
  it("passes a signed-in restore through to the provider's patch", () => {
    const result: RestoreResult = {
      status: "signed-in",
      user: {
        id: "user-1",
        phoneNumber: "+15551234567",
        displayName: "Ada",
        profileComplete: true,
      },
      isAdmin: true,
      impersonating: { id: "user-9", displayName: "Bob" },
    };
    expect(providerPatchFromRestore(result)).toEqual({
      status: "signed-in",
      user: result.user,
      isAdmin: true,
      impersonating: { id: "user-9", displayName: "Bob" },
    });
  });

  it("maps a signed-out restore to the provider's defaults", () => {
    expect(
      providerPatchFromRestore({
        status: "signed-out",
        user: null,
        isAdmin: false,
        impersonating: null,
      }),
    ).toEqual({
      status: "signed-out",
      user: null,
      isAdmin: false,
      impersonating: null,
    });
  });
});

describe("AuthProvider blocked render", () => {
  it("carries isAdmin false and impersonating null before the restore resolves", () => {
    mockedGetToken.mockResolvedValue("jwt-token-abc");
    mockedApiFetch.mockResolvedValue(meBody("Ada"));

    // Effects never fire under `renderToString`: this is the blocked
    // render, and the provider's post-restore exposure (the profile's
    // `User management` row, the impersonation band) is verified end
    // to end by the admin journey spec instead.
    let seen: { isAdmin: unknown; impersonating: unknown } | null = null;
    function Probe() {
      const { isAdmin, impersonating } = useAuth();
      seen = { isAdmin, impersonating };
      return null;
    }
    renderToString(
      createElement(AuthProvider, null, createElement(Probe)),
    );
    expect(seen).toEqual({ isAdmin: false, impersonating: null });
  });
});
