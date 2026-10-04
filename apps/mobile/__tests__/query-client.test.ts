import { describe, expect, it } from "vitest";

import { ApiError, NetworkError, TimeoutError } from "@/lib/api";
import { makeQueryClient } from "@/lib/queries/client";

/** What TanStack calls when a query fails: the failures so far, and the
 *  error. `retry` is typed as `boolean | number | predicate`, so the
 *  narrowing is asserted here rather than cast away silently — the
 *  predicate is what the app's failure policy now lives in. */
type RetryPredicate = (failureCount: number, error: Error) => boolean;

function retryPredicate(): RetryPredicate {
  const retry = makeQueryClient().getDefaultOptions().queries?.retry;
  expect(typeof retry).toBe("function");
  return retry as RetryPredicate;
}

describe("the app-wide retry predicate", () => {
  it("does not retry a timeout — the second attempt cannot succeed where the first timed out", () => {
    const retry = retryPredicate();
    expect(retry(0, new TimeoutError())).toBe(false);
    expect(retry(1, new TimeoutError())).toBe(false);
  });

  it("retries a network failure exactly once", () => {
    const retry = retryPredicate();
    expect(retry(0, new NetworkError())).toBe(true);
    expect(retry(1, new NetworkError())).toBe(false);
  });

  it("retries a 5xx exactly once", () => {
    const retry = retryPredicate();
    expect(retry(0, new ApiError(500))).toBe(true);
    expect(retry(1, new ApiError(500))).toBe(false);
  });

  it("does not retry a 404 — the answer is the same next time", () => {
    expect(retryPredicate()(0, new ApiError(404))).toBe(false);
  });

  it("retries a 429 once, the only 4xx whose answer can change", () => {
    const retry = retryPredicate();
    expect(retry(0, new ApiError(429))).toBe(true);
    expect(retry(1, new ApiError(429))).toBe(false);
  });
});
