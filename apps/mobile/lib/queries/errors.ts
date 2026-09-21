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
    // Code-first: the server sends a specific `code` for the auth
    // failures the verify screen must read back at the code field.
    // Codes below are the ones the auth endpoints can actually emit:
    // - `USER_BANNED` (403): the plan's verify contract (defensive —
    //   today the ban check lives on `checkBanned`, which emits
    //   `ACCOUNT_SUSPENDED`, also mapped here).
    // - `ACCOUNT_SUSPENDED` (403): `middleware/admin.middleware.ts:53`.
    // - `INVALID_CODE` (400): `errors.ts:228`, thrown by the verify
    //   endpoint on a wrong/expired code. Same sentence the client
    //   uses for a malformed code (`lib/queries/auth.ts`), so a wrong
    //   code reads identically whether it fails locally or remotely.
    // - `ACCOUNT_LOCKED` / `RATE_LIMIT_EXCEEDED` (429): `errors.ts:229`
    //   and the generic limiter branch in `error.middleware.ts` — both
    //   fall through to the 429 attempts copy below on purpose.
    switch (err.code) {
      case "USER_BANNED":
      case "ACCOUNT_SUSPENDED":
        return {
          message:
            "This account has been banned. Contact support if this is a mistake.",
          retry: false,
          offline: false,
        };
      case "INVALID_CODE":
        return {
          message: "That code is not right, or it has expired.",
          retry: true,
          offline: false,
        };
      default:
        break;
    }
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
