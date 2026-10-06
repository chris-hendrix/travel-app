/**
 * `DELETE /users/me` and the session drop that has to follow it, in that
 * order, with nothing here knowing about React.
 *
 * Node-importable on purpose, for the same reason `lib/queries/auth.ts`
 * is: the unit suite is plain node with no renderer, and `lib/account.ts`
 * is the one place the two halves of ending a session meet — the request
 * that is specific to deleting an account, and the local cleanup that is
 * not. No `useQueryClient`, no JSX, no store import. The `QueryClient`
 * is a parameter for the same reason `performSignOut`'s is
 * (`lib/authStore.tsx`): the client lives per-mount in `app/_layout.tsx`
 * and there is no module singleton to import, so the caller supplies the
 * one it already holds.
 *
 * It does NOT reuse `performSignOut`, and the reason is that the two
 * halves of sign-out are not both right here. `performSignOut` opens with
 * `unregisterPush()` because the push unsubscribe is an authenticated
 * request that the logout would otherwise invalidate. After this DELETE
 * there is no server session left to end — the account is anonymized and
 * its push subscription rows are gone with it — so the unsubscribe could
 * only be a request that answers 401. What it does run instead is
 * `performSignOut`'s local half, verbatim: the token drop and the cache
 * clear, in that order.
 *
 * Not a `lib/queries/*` module: there is no cache key and no
 * `queryOptions` here, because this is not a query. It deliberately
 * destroys the cache rather than writing to it, which is the opposite of
 * what that seam is for.
 */

import type { QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/session";

/** Mirrors `deleteAccountResponseSchema`: `{ success: true }`. */
type DeleteAccountResponse = { success: true };

/**
 * Delete the signed-in person's account and drop the session it lived in,
 * before the caller navigates anywhere.
 *
 * The request first: `deleteAccountSchema` guards the call with
 * `{ confirm: "delete" }` because this is irreversible from the user's
 * side, and a failed delete must leave the session exactly as it was so
 * the second press has something to be spent against. The token next, then
 * the cache, because the cache is what the next screen reads while it
 * still believes there is a session — the sign-out foot's own reason for
 * awaiting before it leaves.
 *
 * Throws on failure like every other write in this app (`apiFetch`'s
 * `ApiError` / `TimeoutError` / `NetworkError`); the caller renders it
 * through `toErrorCopy`, so nothing here decides what a person reads when
 * it goes wrong. Resolves nothing: navigation is the caller's.
 *
 * The optional `client` is `performSignOut`'s own convention. In bare node
 * there is no provider above the store, so the cache clear skips what it
 * has no cache for; in the app the store always supplies one.
 */
export async function deleteAccount(client?: QueryClient): Promise<void> {
  await apiFetch<DeleteAccountResponse>("/users/me", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "delete" }),
  });
  // `try/await` rather than `clearToken().catch()`, for the reason
  // `performSignOut` gives: under the `importOriginal` test seam a bare
  // `vi.fn()` stub returns `undefined`, and `await undefined` is fine
  // where `.catch()` on it is not. A token store that fails here is not
  // worth turning a successful deletion into an error the screen would
  // render as "that didn't work" — the account is gone either way.
  try {
    await clearToken();
  } catch {
    // The token store is best-effort on web review builds by design
    // (see `lib/session.ts`).
  }
  client?.clear();
}