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
 * only be a request that answers 401. What it runs instead is the rest of
 * the seam, in `endSession`'s shape: the caller's local reset, the way out
 * of the session's screens, the token drop and the cache clear.
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
 * before anything navigates.
 *
 * The order mirrors `endSession`'s — the session's own state, then its
 * screens, then the token and the cache — with the DELETE in front of all
 * of it, because the request needs a live bearer. `onDeleted` is the
 * caller's local reset and `leaveRoutes` is the way out of the screens the
 * session was showing; both arrive as callbacks for `endSession`'s reason
 * (this module is loaded by node tests with no renderer, and routing lives
 * in `app/_layout.tsx`).
 *
 * Leaving is what keeps the navigator's own re-render from reading: the
 * reset re-renders `useAuth`'s consumers and nothing else, so the trips
 * list behind the profile dialog stays mounted unless it is navigated out
 * of — and a `replace` swaps only the top of the stack, which left `/trips`
 * mounted behind `/login`, rebuilding the emptied list and fetching it
 * anonymously into `TripsErrorBoundary`. That is the failure `endSession`
 * exists to remove, and this was the sibling path that still had it.
 *
 * The clear is deliberately *after* the token here, the opposite of
 * sign-out. There the cache goes while the bearer still answers, so a
 * render that slips through issues an authenticated request. Here the
 * account is already gone server-side and the bearer cannot answer
 * anything, so an early clear would only invite the 401 this seam exists to
 * avoid; leaving first means there is no screen left to rebuild what the
 * clear removes.
 *
 * A failed DELETE throws before any callback runs, so the session is left
 * exactly as it was and the second press has something to be spent
 * against.
 *
 * Throws on failure like every other write in this app (`apiFetch`'s
 * `ApiError` / `TimeoutError` / `NetworkError`); the caller renders it
 * through `toErrorCopy`, so nothing here decides what a person reads when
 * it goes wrong. Resolves nothing: navigation is the callbacks'.
 *
 * The optional `client` is `performSignOut`'s own convention. In bare node
 * there is no provider above the store, so the cache clear skips what it
 * has no cache for; in the app the store always supplies one.
 */
export async function deleteAccount(
  client?: QueryClient,
  onDeleted?: () => void,
  leaveRoutes?: () => void,
): Promise<void> {
  await apiFetch<DeleteAccountResponse>("/users/me", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "delete" }),
  });
  // The session's own state first, and only now that the account is gone:
  // the request above threw before this line on a failure, so the retry
  // still has a session to spend.
  onDeleted?.();
  // Then the screens, exactly as `endSession` does and for the same reason:
  // the reset re-renders `useAuth`'s consumers and nothing else, and it is
  // the navigator's re-render, not the reset's, that would rebuild the
  // emptied query.
  leaveRoutes?.();
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