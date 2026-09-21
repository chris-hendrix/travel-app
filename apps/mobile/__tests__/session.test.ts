import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { ApiError, apiFetch } from "@/lib/api";
import { requestCode } from "@/lib/queries/auth";
import { toErrorCopy } from "@/lib/queries/errors";
import { clearToken, getToken, setToken } from "@/lib/session";

const mockedApiFetch = vi.mocked(apiFetch);

// Node has no localStorage; the stub below is the same string-keyed
// contract the web fallback uses, nothing more.
function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  stubLocalStorage();
});

it("round-trips a token through the web fallback store", async () => {
  expect(await getToken()).toBeNull();
  await setToken("mock-token-+15550000001");
  expect(await getToken()).toBe("mock-token-+15550000001");
  await clearToken();
  expect(await getToken()).toBeNull();
});

describe("requestCode", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("POSTs /auth/request-code with {phoneNumber, smsConsent}", async () => {
    mockedApiFetch.mockResolvedValue({ success: true, message: "Code sent" });

    await requestCode({ phoneNumber: "+15551234567", smsConsent: true });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = mockedApiFetch.mock.calls[0] as [
      string,
      NonNullable<Parameters<typeof fetch>[1]> | undefined,
    ];
    expect(path).toBe("/auth/request-code");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(init?.body))).toEqual({
      phoneNumber: "+15551234567",
      smsConsent: true,
    });
  });

  it("surfaces the cooldown copy on a 429", async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(429, "Slow down", "RATE_LIMITED"),
    );

    const err = await requestCode({
      phoneNumber: "+15551234567",
      smsConsent: true,
    }).catch((caught: unknown) => caught);

    expect(err).toBeInstanceOf(ApiError);
    expect(toErrorCopy(err)).toEqual({
      message: "Too many tries. Wait a minute.",
      retry: false,
      offline: false,
    });
  });

  it("never reaches the network for a bad number", async () => {
    await expect(
      requestCode({ phoneNumber: "not-a-number", smsConsent: true }),
    ).rejects.toThrow("That does not look like a number.");
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("never reaches the network without consent", async () => {
    await expect(
      requestCode({ phoneNumber: "+15551234567", smsConsent: false }),
    ).rejects.toThrow();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
