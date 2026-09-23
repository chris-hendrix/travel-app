import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getToken: vi.fn(), clearToken: vi.fn() }));

import { getToken, clearToken } from "@/lib/session";
import {
  ApiError,
  NetworkError,
  TimeoutError,
  apiFetch,
  onUnauthorized,
} from "@/lib/api";
import { isFlightNumber, lookupFlight, normalizeFlightNumber, formatFlightNumber } from "@/lib/flights";

const mockedGetToken = vi.mocked(getToken);
const mockedClearToken = vi.mocked(clearToken);

// The 401 subscriber under test. Reset in `beforeEach` so a listener
// never leaks from one recovery test into the next.
let unsubscribe401: (() => void) | null = null;

type RequestInitLike = NonNullable<Parameters<typeof fetch>[1]>;

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  mockedGetToken.mockReset();
  mockedGetToken.mockResolvedValue(null);
  mockedClearToken.mockReset();
  // No stale 401 subscriber across tests: each recovery test
  // subscribes its own listener, which unsubscribes on teardown.
  unsubscribe401?.();
  unsubscribe401 = null;
  delete process.env.EXPO_PUBLIC_API_URL;
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  process.env.EXPO_PUBLIC_API_URL = "http://api.test/api";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (globalThis as { __DEV__?: boolean }).__DEV__;
});

describe("apiFetch", () => {
  it("throws loudly with no base URL outside development instead of falling back", async () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson({})),
    );
    await expect(apiFetch("/ping")).rejects.toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it("throws TimeoutError when the response is past the timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInitLike) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      ),
    );
    const pending = apiFetch("/slow");
    const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(11_000);
    await assertion;
  });

  it("throws ApiError carrying the status on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response),
    );
    const error = await apiFetch("/missing").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
  });

  it("carries the server code and message from the error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 403,
            statusText: "Forbidden",
            json: async () => ({
              success: false,
              error: { code: "FORBIDDEN", message: "You cannot do that" },
            }),
          }) as Response,
      ),
    );
    const error = await apiFetch("/nope").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
    expect((error as ApiError).code).toBe("FORBIDDEN");
    expect((error as ApiError).message).toBe("You cannot do that");
  });

  it("resolves undefined on a 204 with no body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 204 }) as Response),
    );
    await expect(apiFetch("/empty")).resolves.toBeUndefined();
  });

  it("falls back to the status text when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            json: async () => {
              throw new SyntaxError("Unexpected token");
            },
          }) as unknown as Response,
      ),
    );
    const error = await apiFetch("/boom").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
    expect((error as ApiError).message).toBe("Internal Server Error");
  });

  it("throws NetworkError on transport failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(apiFetch("/down")).rejects.toBeInstanceOf(NetworkError);
  });

  it("carries Authorization: Bearer <token> when lib/session holds one", async () => {
    mockedGetToken.mockResolvedValue("mock-token-abc");
    const seen: Array<{ url: string; init?: RequestInitLike }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInitLike = {}) => {
        seen.push({ url, init });
        return okJson({});
      }),
    );
    await apiFetch("/ping");
    const headers = new Headers(seen[0]!.init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer mock-token-abc");
    expect(seen[0]!.url).toBe("http://api.test/api/ping");
  });

  it("clears the dead token and notifies the 401 subscriber, then still throws", async () => {
    // A 401 only ends a session when the request carried a token.
    mockedGetToken.mockResolvedValue("stale-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response),
    );
    const notified = vi.fn();
    unsubscribe401 = onUnauthorized(notified);

    const error = await apiFetch("/me").catch((e) => e);
    // Recovery runs detached from the throw, so let it land.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(mockedClearToken).toHaveBeenCalledTimes(1);
    expect(notified).toHaveBeenCalledTimes(1);
  });

  it("leaves the token and the subscriber alone on any other status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }) as Response),
    );
    const notified = vi.fn();
    unsubscribe401 = onUnauthorized(notified);

    await expect(apiFetch("/nope")).rejects.toBeInstanceOf(ApiError);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedClearToken).not.toHaveBeenCalled();
    expect(notified).not.toHaveBeenCalled();
  });

  it("treats a 401 from sign-out as the expected answer, not a dead session", async () => {
    // `performSignOut` signs out with `POST /auth/logout`, which answers
    // 401 once the token is gone. Counting that as session death made
    // sign-out re-trigger itself, forever.
    mockedGetToken.mockResolvedValue("stale-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response),
    );
    const notified = vi.fn();
    unsubscribe401 = onUnauthorized(notified);

    await expect(
      apiFetch("/auth/logout", { method: "POST" }),
    ).rejects.toBeInstanceOf(ApiError);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedClearToken).not.toHaveBeenCalled();
    expect(notified).not.toHaveBeenCalled();
  });

  it("does not recover a 401 that carried no token at all", async () => {
    // Nothing to discard: the app is already signed out, and firing
    // recovery here is what turned anonymous 401s into a sign-out loop.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response),
    );
    const notified = vi.fn();
    unsubscribe401 = onUnauthorized(notified);

    await expect(apiFetch("/me")).rejects.toBeInstanceOf(ApiError);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedClearToken).not.toHaveBeenCalled();
    expect(notified).not.toHaveBeenCalled();
  });
});

describe("isFlightNumber", () => {
    it.each(["UA123", "UA 1842", "ua-1842", " ua1842 ", "BA2490"])(
      "accepts %s",
      (value) => {
        expect(isFlightNumber(value)).toBe(true);
      },
    );

    it.each(["", "U", "12345", "UA12345", "UA-  ", "U A"])(
      "rejects %s",
      (value) => {
        expect(isFlightNumber(value)).toBe(false);
      },
    );

    it("normalizes to the compact form", () => {
      expect(normalizeFlightNumber("UA 1842")).toBe("UA1842");
      expect(normalizeFlightNumber("ua-1842")).toBe("UA1842");
      expect(normalizeFlightNumber("UA1842")).toBe("UA1842");
    });
  });

describe("formatFlightNumber", () => {
  it("puts the space in, uppercased, however it was typed", () => {
    // The placeholder's own shape is the promise this keeps: a space in
    // the field is accepted rather than eaten.
    expect(formatFlightNumber("UA 1842")).toBe("UA 1842");
    expect(formatFlightNumber("ua1842")).toBe("UA 1842");
    expect(formatFlightNumber("ua-1842")).toBe("UA 1842");
    expect(formatFlightNumber("  ua   1842 ")).toBe("UA 1842");
  });

  it.each([
    ["UAL123", "UAL 123"],
    ["BA2490", "BA 2490"],
    ["U2123", "U2 123"],
    ["4U123", "4U 123"],
  ])("splits %s as %s", (input, expected) => {
    expect(formatFlightNumber(input)).toBe(expected);
  });

  it("reads three letters as the code before two characters", () => {
    // "U2123" must be U2 + 123, never a one-letter code: the same order
    // isFlightNumber reads the split in, and the same reason.
    expect(formatFlightNumber("UAL123456")).toBe("UAL 123456");
    expect(formatFlightNumber("U2123")).toBe("U2 123");
  });

  it("holds an unfinished number rather than rejecting it", () => {
    // Runs on every keystroke: "UA" is an unfinished number, not a wrong
    // one. No trailing space either, so the field never holds "UA ".
    expect(formatFlightNumber("")).toBe("");
    expect(formatFlightNumber("U")).toBe("U");
    expect(formatFlightNumber("UA")).toBe("UA");
    expect(formatFlightNumber("UA ")).toBe("UA");
    expect(formatFlightNumber("UAL")).toBe("UAL");
    expect(formatFlightNumber("U2")).toBe("U2");
  });

  it("is idempotent, so reading a record back is a no-op", () => {
    for (const value of ["UA 1842", "UAL 123", "U2 123", "", "UA"]) {
      expect(formatFlightNumber(formatFlightNumber(value))).toBe(
        formatFlightNumber(value),
      );
    }
  });

  it("agrees with isFlightNumber on what it formats", () => {
    for (const value of ["UA1842", "UAL123", "U2123", "4U123", "BA2490"]) {
      expect(isFlightNumber(formatFlightNumber(value))).toBe(true);
      expect(formatFlightNumber(value)).toMatch(/^[A-Z\d]{2,3} \d+$/);
    }
  });
});

describe("lookupFlight", () => {
  const flight = {
    departureAirport: { iata: "SFO", name: "San Francisco International" },
    departureTime: "2026-07-15T14:00:00Z",
    arrivalAirport: { iata: "JFK", name: "John F. Kennedy International" },
    arrivalTime: "2026-07-15T22:30:00Z",
  };

  it("returns the flight for a known flight", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson({ available: true, flight })),
    );
    await expect(lookupFlight("UA123", "2026-07-15")).resolves.toEqual(flight);
  });

  it("sends the normalized compact body for spaced input", async () => {
    const seen: Array<{ init: RequestInitLike | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInitLike) => {
        seen.push({ init });
        return okJson({ available: true, flight });
      }),
    );
    await expect(lookupFlight("UA 1842", "2026-07-15")).resolves.toEqual(flight);
    expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({
      flightNumber: "UA1842",
      date: "2026-07-15",
    });
  });

  it("sends the normalized compact body for hyphenated lowercase input", async () => {
    const seen: Array<{ init: RequestInitLike | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInitLike) => {
        seen.push({ init });
        return okJson({ available: true, flight });
      }),
    );
    await expect(lookupFlight("ua-1842", "2026-07-15")).resolves.toEqual(flight);
    expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({
      flightNumber: "UA1842",
      date: "2026-07-15",
    });
  });

  it("leaves the wire body unchanged for already-compact input", async () => {
    const seen: Array<{ init: RequestInitLike | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInitLike) => {
        seen.push({ init });
        return okJson({ available: true, flight });
      }),
    );
    await expect(lookupFlight("UA123", "2026-07-15")).resolves.toEqual(flight);
    expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({
      flightNumber: "UA123",
      date: "2026-07-15",
    });
  });

  it("returns null for an unknown flight", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson({ available: false })),
    );
    await expect(lookupFlight("UA9999", "2026-07-15")).resolves.toBeNull();
  });

  it("returns null when the server answers 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response),
    );
    await expect(lookupFlight("UA9999", "2026-07-15")).resolves.toBeNull();
  });

  it("propagates transport failures instead of collapsing them into null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(lookupFlight("UA123", "2026-07-15")).rejects.toBeInstanceOf(NetworkError);
  });

  it("propagates timeouts instead of collapsing them into null", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInitLike) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      ),
    );
    const pending = lookupFlight("UA123", "2026-07-15");
    const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(11_000);
    await assertion;
  });
});
