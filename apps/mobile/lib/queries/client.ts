import { QueryClient } from "@tanstack/react-query";
import { ApiError, TimeoutError } from "@/lib/api";

/**
 * One fresh QueryClient per call, with the app-wide query defaults:
 * a 30s stale window and a retry policy that is a predicate rather
 * than a count. Call it once per provider mount (e.g.
 * `useState(() => makeQueryClient())`), never shared across mounts.
 *
 * Node-importable by design: no react-native imports here, so unit
 * tests run in plain node with no renderer. Keep it that way —
 * `lib/api.ts` is deliberately node-importable for the same reason,
 * and importing its error classes is what lets the predicate below
 * reason about the errors the boundary actually throws.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          // `retry: 1` counted failures, not their kind, and with
          // `REQUEST_TIMEOUT_MS` at 10s that made a timeout a ~21s
          // failure — the timeout, then TanStack's ~1s backoff, then
          // the same timeout again. The second attempt cannot succeed
          // where the first timed out: nothing about the request
          // changed, only the clock. So a timeout is spent once, and
          // what is left of the policy is a policy.
          if (error instanceof TimeoutError) return false;
          // A 4xx is the server's considered answer, so it is read
          // once. 429 is the exception: it names a rate limit, which
          // is the one 4xx whose answer changes with time.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            return error.status === 429 && failureCount < 1;
          }
          // NetworkError and 5xx are the failures worth one more try:
          // the request never arrived, or the server did. Once is the
          // whole policy — `failureCount < 1` is the old `retry: 1`
          // spelled out where it can now be read.
          return failureCount < 1;
        },
        staleTime: 30_000,
      },
    },
  });
}
