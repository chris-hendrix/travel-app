import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getToken: vi.fn() }));

import { getToken } from "@/lib/session";
import { ApiError, NetworkError, TimeoutError, apiFetch } from "@/lib/api";
import { isFlightNumber, lookupFlight, normalizeFlightNumber } from "@/lib/flights";

const mockedGetToken = vi.mocked(getToken);

type RequestInitLike = NonNullable<Parameters<typeof fetch>[1]>;

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  mockedGetToken.mockReset();
  mockedGetToken.mockResolvedValue(null);
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
