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
  restorePaint,
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

/** A promise the test opens and closes itself, so the `/auth/me` read can
 *  be held open across an assertion. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
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

  it("hands the stored token to the onToken seam before the me read resolves", async () => {
    // The seam exists so a caller can start its own read while
    // `/auth/me` is still in flight. If the callback only fired after
    // the await below, the two reads would still queue behind each
    // other and the seam would buy nothing.
    const onToken = vi.fn();
    const gate = deferred<ReturnType<typeof meBody>>();
    let tokensWhenTheReadStarted: string[] = [];
    mockedGetToken.mockResolvedValue("jwt-token-abc");
    mockedApiFetch.mockImplementation(async () => {
      tokensWhenTheReadStarted = onToken.mock.calls.map(([token]) => token);
      return gate.promise;
    });

    const restore = restoreSession(onToken);
    await vi.waitFor(() => expect(mockedApiFetch).toHaveBeenCalledTimes(1));

    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledWith("jwt-token-abc");
    expect(tokensWhenTheReadStarted).toEqual(["jwt-token-abc"]);

    gate.resolve(meBody("Ada"));
    const result = await restore;
    expect(result.status).toBe("signed-in");
  });

  it("never calls the onToken seam when there is no token to hand over", async () => {
    const onToken = vi.fn();
    mockedGetToken.mockResolvedValue(null);

    const result = await restoreSession(onToken);

    expect(onToken).not.toHaveBeenCalled();
    expect(result.status).toBe("signed-out");
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

describe("restorePaint", () => {
  const signedIn: RestoreResult = {
    status: "signed-in",
    user: {
      id: "user-1",
      phoneNumber: "+15551234567",
      displayName: "Ada",
      profileComplete: true,
    },
    isAdmin: false,
    impersonating: null,
  };
  const signedOut: RestoreResult = {
    status: "signed-out",
    user: null,
    isAdmin: false,
    impersonating: null,
  };

  it("adopts whenever the read answered", () => {
    expect(restorePaint(signedIn, true, { failClosed: false })).toBe("adopt");
    expect(restorePaint(signedIn, true, { failClosed: true })).toBe("adopt");
  });

  it("signs out when the token is gone — a 401 cleared it", () => {
    expect(restorePaint(signedOut, false, { failClosed: false })).toBe(
      "sign-out",
    );
    expect(restorePaint(signedOut, false, { failClosed: true })).toBe(
      "sign-out",
    );
  });

  it("keeps the session a sign-in already painted when the read failed but the token survived", () => {
    // The regression this policy exists for: verify-code answered, its
    // reply painted the person signed in, and the follow-up `me` read
    // blipped. Painting signed-out here landed them back on the
    // landing holding a perfectly good token.
    expect(restorePaint(signedOut, true, { failClosed: false })).toBe("keep");
  });

  it("fails closed after an identity swap, where the paint is the old identity", () => {
    expect(restorePaint(signedOut, true, { failClosed: true })).toBe(
      "sign-out",
    );
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
