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

import { ApiError, apiFetch } from "@/lib/api";
import { verifyCode } from "@/lib/queries/auth";
import { toErrorCopy } from "@/lib/queries/errors";
import { setToken } from "@/lib/session";

const mockedApiFetch = vi.mocked(apiFetch);
const mockedSetToken = vi.mocked(setToken);

const INPUT = {
  phoneNumber: "+15551234567",
  code: "123456",
  smsConsent: true as const,
};

beforeEach(() => {
  mockedApiFetch.mockReset();
  mockedSetToken.mockReset();
});

describe("verify auth errors", () => {
  it("a 403 USER_BANNED yields the banned copy and stores no user/token", async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(403, "User is banned", "USER_BANNED"),
    );

    const err = await verifyCode(INPUT).catch((caught) => caught);

    expect(err).toBeInstanceOf(ApiError);
    expect(toErrorCopy(err)).toEqual({
      message: "This account has been banned. Contact support if this is a mistake.",
      retry: false,
      offline: false,
    });
    expect(mockedSetToken).not.toHaveBeenCalled();
  });

  it("a 429 yields the attempts copy and stores no user/token", async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(
        429,
        "Account is locked due to too many failed attempts. Try again in 15 minute(s).",
        "ACCOUNT_LOCKED",
      ),
    );

    const err = await verifyCode(INPUT).catch((caught) => caught);

    expect(err).toBeInstanceOf(ApiError);
    expect(toErrorCopy(err)).toEqual({
      message: "Too many tries. Wait a minute.",
      retry: false,
      offline: false,
    });
    expect(mockedSetToken).not.toHaveBeenCalled();
  });
});
