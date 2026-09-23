import { describe, expect, it } from "vitest";

import { ApiError, NetworkError, TimeoutError } from "@/lib/api";
import { isOffline, toErrorCopy } from "@/lib/queries/errors";

describe("toErrorCopy", () => {
  it("maps NetworkError to the offline copy", () => {
    const copy = toErrorCopy(new NetworkError());
    expect(copy.offline).toBe(true);
    expect(copy.retry).toBe(true);
  });

  it("maps TimeoutError to the slow copy with a retry affordance", () => {
    const copy = toErrorCopy(new TimeoutError());
    expect(copy.message).toBe("That took too long");
    expect(copy.retry).toBe(true);
    expect(copy.offline).toBe(false);
  });

  it("maps 401 to the sign-in copy", () => {
    const copy = toErrorCopy(new ApiError(401, "Unauthorized"));
    expect(copy.message).toBe("Sign in again");
    expect(copy.retry).toBe(false);
  });

  it("maps 403 to the forbidden copy", () => {
    const copy = toErrorCopy(new ApiError(403, "Forbidden", "FORBIDDEN"));
    expect(copy.message).toBe("You can't do that here");
    expect(copy.retry).toBe(false);
  });

  it("maps 429 to the cooldown copy", () => {
    const copy = toErrorCopy(new ApiError(429, "Too many requests"));
    expect(copy.message).toBe("Too many tries. Wait a minute.");
    expect(copy.retry).toBe(false);
  });

  it("passes 404 through without a generic message", () => {
    const copy = toErrorCopy(new ApiError(404, "Not found"));
    expect(copy.message).toBeNull();
    expect(copy.retry).toBe(false);
    expect(copy.offline).toBe(false);
  });

  it("maps 5xx to the generic copy with a retry affordance", () => {
    for (const status of [500, 502, 503]) {
      const copy = toErrorCopy(new ApiError(status, "Server blew up"));
      expect(copy.message).toBe("Something went wrong");
      expect(copy.retry).toBe(true);
    }
  });

  it("falls back to the generic copy for anything else", () => {
    const copy = toErrorCopy(new Error("weird"));
    expect(copy.message).toBe("Something went wrong");
    expect(copy.retry).toBe(true);
  });
});

describe("isOffline", () => {
  it("is true for NetworkError only", () => {
    expect(isOffline(new NetworkError())).toBe(true);
    expect(isOffline(new TimeoutError())).toBe(false);
    expect(isOffline(new ApiError(500, "boom"))).toBe(false);
    expect(isOffline(new Error("boom"))).toBe(false);
    expect(isOffline(null)).toBe(false);
  });
});
