import { ApiError, NetworkError, TimeoutError } from "@/lib/api";

/**
 * What a screen needs to render a failed request where its content
 * would have been. Pure function, no React, no fetch — node-importable
 * so unit tests run in plain node; keep it that way.
 *
 * Vocabulary matches the lab's Feedback section
 * (`app/design/index.tsx`): a failure belongs where its content would
 * have been, with a way to ask again. `message` is the caller's
 * sentence handed to `InlineError`; when `offline` is true the screen
 * renders `OfflineBlock` (its default copy) instead. `retry` decides
 * whether the block gets a retry affordance (`onRetry` / `Try again`).
 * A `null` message means "passed through": the caller decides (e.g.
 * 404 → the gone/empty branch), never a swallowed generic.
 */
export type ErrorCopy = {
  message: string | null;
  retry: boolean;
  offline: boolean;
};

const GENERIC = "Something went wrong";

/** True only for `NetworkError`: the request never reached the server. */
export function isOffline(err: unknown): boolean {
  return err instanceof NetworkError;
}

export function toErrorCopy(err: unknown): ErrorCopy {
  if (err instanceof NetworkError) {
    return { message: null, retry: true, offline: true };
  }
  if (err instanceof TimeoutError) {
    return { message: "That took too long", retry: true, offline: false };
  }
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return { message: "Sign in again", retry: false, offline: false };
    }
    if (err.status === 403) {
      return { message: "You can't do that here", retry: false, offline: false };
    }
    if (err.status === 429) {
      // No retry affordance on purpose: asking again right away only
      // re-trips the limiter. The copy tells the person when to come back.
      return {
        message: "Too many tries. Wait a minute.",
        retry: false,
        offline: false,
      };
    }
    if (err.status === 404) {
      return { message: null, retry: false, offline: false };
    }
    if (err.status >= 500) {
      return { message: GENERIC, retry: true, offline: false };
    }
    return { message: GENERIC, retry: true, offline: false };
  }
  return { message: GENERIC, retry: true, offline: false };
}
