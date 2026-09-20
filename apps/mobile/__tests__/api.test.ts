import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getToken: vi.fn() }));

import { getToken } from "@/lib/session";
import { ApiError, NetworkError, TimeoutError, apiFetch } from "@/lib/api";

const mockedGetToken = vi.mocked(getToken);

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
        (_url: string, init?: RequestInit) =>
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
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
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
