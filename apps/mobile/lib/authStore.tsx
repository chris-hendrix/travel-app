import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, onUnauthorized } from "@/lib/api";
import { deleteAccount as deleteAccountApi } from "@/lib/account";
import {
  meBodyOptions,
  requestCode as requestAuthCode,
  verifyCode as verifyAuthCode,
  completeProfile as completeAuthProfile,
  signOutServer,
} from "@/lib/queries/auth";
import { tripsListOptions } from "@/lib/queries/trips";
import type { Profile } from "@/lib/profile";
import { DEMO_AUTH_USER } from "@/lib/demo";
import { toProfile } from "@/lib/mapping";
import { clearToken, getToken } from "@/lib/session";
import { setSignedIn } from "@/lib/sessionFlag";

/**
 * Who is signed in, standing in for `POST /auth/request-code`,
 * `POST /auth/verify` and `POST /auth/complete-profile`.
 *
 * The shape is the API's, not a simpler one: `verify` returns the token
 * and a `requiresProfile` flag, so a person is signed in before their
 * profile exists, and the third screen is not optional. Keeping that
 * here means the screens already branch the way the real ones will.
 *
 * Two things are missing on purpose, both because nothing persists yet:
 * the session dies with the process, and there is no lockout after
 * repeated wrong codes, which the API does enforce with a `Retry-After`.
 */

/** What the dev SMS sender always sends (`ENABLE_FIXED_VERIFICATION_CODE`).
 *  Kept for the lab only: the real verify path below never compares codes
 *  locally — the server decides, via its `requiresProfile` flag. */
export const DEV_CODE = "123456";

export type AuthUser = {
  id: string;
  phoneNumber: string;
  /** Empty until the third screen has run. */
  displayName: string;
  profileComplete: boolean;
};

/**
 * Where the cold start stands: `restoring` until the stored token has
 * been checked against `GET /auth/me`, then one of the two settled
 * states. Screens gate on this, never on `user` alone — a null user
 * while `restoring` means "not known yet", not "signed out".
 */
export type AuthStatus = "restoring" | "signed-in" | "signed-out";

/** Who else this session is, while an admin impersonates an account. */
export type Impersonating = { id: string; displayName: string } | null;

export type RestoreResult =
  | { status: "signed-in"; user: AuthUser; isAdmin: boolean; impersonating: Impersonating }
  | { status: "signed-out"; user: null; isAdmin: false; impersonating: null };

function authUserFromProfile(profile: Profile): AuthUser {
  return {
    id: profile.id,
    phoneNumber: profile.phoneNumber,
    displayName: profile.displayName,
    // The server's own signal: a fresh account comes back from
    // `GET /auth/me` with an empty name until complete-profile runs.
    profileComplete: profile.displayName.trim().length > 0,
  };
}

/**
 * The provider's patch for a restore result — the mapping decision,
 * extracted pure so it is testable without a renderer (the suite is
 * plain node, no jsdom): which fields of the restore result each piece
 * of provider state takes. The post-restore exposure itself (the
 * profile's `User management` row, the impersonation band) is covered
 * end to end by the admin journey spec.
 */
export function providerPatchFromRestore(result: RestoreResult): {
  status: AuthStatus;
  user: AuthUser | null;
  isAdmin: boolean;
  impersonating: Impersonating;
} {
  return {
    status: result.status,
    user: result.user,
    isAdmin: result.isAdmin,
    impersonating: result.impersonating,
  };
}

/**
 * What a restore result is allowed to do to a session that is already
 * painted — the policy, extracted pure for the same reason the mapping
 * below is (this suite has no renderer).
 *
 * `restoreSession` reports `signed-out` for every failure that is not a
 * 401, and it KEEPS the token when it does — only a 401 clears it. So a
 * blip on that one read must not be allowed to demote a session that
 * still holds a live token:
 *
 * - `"adopt"` — the read answered; take its identity.
 * - `"keep"` — the read failed but the token survived, and the caller
 *   already knows who it is, because a sign-in step painted the reply
 *   from its own response. Painting `signed-out` here threw someone who
 *   had just signed in back to the landing holding a good token.
 * - `"sign-out"` — the token is gone (a 401 cleared it), or the caller
 *   cannot say who it is: an identity SWAP re-reads precisely because
 *   the paint is the old identity and the token is the new one, so a
 *   failed read means we do not know. Fail closed rather than keep
 *   painting someone we are not.
 */
export function restorePaint(
  result: RestoreResult,
  tokenSurvived: boolean,
  { failClosed }: { failClosed: boolean },
): "adopt" | "keep" | "sign-out" {
  if (result.status === "signed-in") return "adopt";
  if (!tokenSurvived) return "sign-out";
  return failClosed ? "sign-out" : "keep";
}

/**
 * The cold-start check, run once by `AuthProvider` on mount. A stored
 * token is validated through `meBodyOptions` (the raw envelope — one
 * source of truth, not a cached user); no token means signed-out
 * without touching the network. A 401 clears the stale token and signs
 * out — anything else signs out but keeps the token, so a transient
 * failure does not destroy the session (retry behaviour belongs to its
 * own task).
 *
 * Identity is normalized at this boundary: the API omits `isAdmin`
 * for an ordinary session (absent means false) and sends the
 * impersonation pair only while impersonating — `impersonating: true`
 * with no `impersonatingUser` normalizes to `null`, never a
 * half-filled object.
 *
 * `onToken` is the one moment the stored token is known and the
 * network is not yet busy, so it is the caller's chance to start a
 * read the app is about to want: handed the token synchronously,
 * before `/auth/me` is issued, so the two requests race instead of
 * queueing behind each other. It is an optional parameter rather than
 * a prefetch baked in here because this function is deliberately
 * React-free and query-client-free, and because the two callers
 * disagree — the boot effect wants the read, `adoptIdentity` does not
 * (a sign-in clears the cache and navigates, so it would fetch a list
 * the flow is about to invalidate). The callback is never awaited and
 * never able to fail the restore; a caller that starts a read it does
 * not need pays one wasted request and nothing else.
 */
export async function restoreSession(
  onToken?: (token: string) => void,
): Promise<RestoreResult> {
  const token = await getToken();
  if (!token) return { status: "signed-out", user: null, isAdmin: false, impersonating: null };
  onToken?.(token);
  try {
    // `meBodyOptions()` explicitly, never `meOptions().queryFn`: the
    // `select` shapes the observer's data and not `queryFn`'s return
    // type, so the wrong call still typechecks while reading the wrong
    // shape.
    const me = meBodyOptions();
    const body = await me.queryFn!({ queryKey: me.queryKey } as never);
    return {
      status: "signed-in",
      user: authUserFromProfile(toProfile(body.user)),
      isAdmin: body.isAdmin === true,
      impersonating:
        body.impersonating === true && body.impersonatingUser
          ? { id: body.impersonatingUser.id, displayName: body.impersonatingUser.displayName }
          : null,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearToken();
    }
    return { status: "signed-out", user: null, isAdmin: false, impersonating: null };
  }
}

/**
 * The full sign-out, testable without React: tell the server
 * (best-effort — a dead network still signs out locally), drop the
 * bearer token, and empty the whole query cache so no signed-in data
 * survives for the next account. It is the second half of the
 * provider's `signOut`; the first is the local reset, and `endSession`
 * below is where the two are put in order.
 */
export async function performSignOut(client?: QueryClient): Promise<void> {
  // Push first, and deliberately: the unsubscribe is an authenticated
  // request, and `signOutServer()` below blacklists the very token it
  // would carry. Unsubscribing after the logout answered 401 for every
  // DELETE and left the subscription row in place — a signed-out phone
  // kept receiving pushes, which is what a device showed (the API log
  // had the DELETE, the row was still there afterwards).
  try {
    const { unregisterPush } = await import("@/lib/push");
    await unregisterPush();
  } catch {
    // A phone that cannot unsubscribe still signs out.
  }
  try {
    await signOutServer();
  } catch {
    // Local sign-out wins: the token is dropped and the cache cleared
    // below regardless, so an offline sign-out still lands signed-out.
    // Banned/locked copy stays a Task 6 concern — sign-out never
    // surfaces a code-specific message.
  }
  // `try/await` rather than `clearToken().catch()`: under the
  // `importOriginal` seam a bare `vi.fn()` stub returns `undefined`,
  // and `await undefined` is fine where `.catch` on it is not. The push
  // unsubscribe is not here: it belongs to `performSignOut`, before the
  // token is revoked, and not to the 401 recovery path that also clears
  // this token (where no request could authenticate anyway).
  try {
    await clearToken();
  } catch {
    // The token store is best-effort on web review builds by design
    // (see `lib/session.ts`); a failure here never blocks sign-out.
  }
  // No client in bare node renders (no QueryClientProvider above the
  // store); in the app the provider always supplies one, so the cache
  // clear only ever skips where there is no cache to clear.
  client?.clear();
}

/**
 * The whole of sign-out, in the only order that holds: the session's
 * local state goes first, then its screens, then the cache — and the
 * token and the network last, because both the unsubscribe and the
 * logout need a live bearer.
 *
 * Two different things have to be true before the cache is emptied, and
 * they are not the same thing. The **leave** is what removes the
 * observers: flipping the session's state re-renders `useAuth`'s
 * consumers and nothing else, so the screens behind the dialog never
 * hear about it and stay mounted — with the cache emptied under them,
 * the next render of any of those observers builds its query again,
 * empty and pending, and fetches. The **flip** is what closes the reads
 * that are gated on the flag (`me`, the notifications list, the header's
 * bell): they answer `enabled: false` from the moment the session is
 * gone, so even a render that slips past the leave issues nothing. The
 * requests the old order fired came back 401 `Invalid or expired token`
 * into the screen's error boundary, which is what a dev build showed
 * over the sign-out itself.
 *
 * The clear runs between the two halves rather than at the end of
 * `performSignOut`, and that is the rest of the fix rather than a
 * tidy-up. `performSignOut` only empties the cache once its unsubscribe
 * and its logout have answered, so the previous session's data stayed in
 * memory for the length of a round trip — up to `REQUEST_TIMEOUT_MS`
 * when the API is unreachable — and `leaveRoutes` rewrites only the top
 * history entry, so the browser's Back during that window lands on
 * `/trips` and paints the account that just signed out. Clearing while
 * the bearer still works buys two things and costs nothing: a render
 * that does slip through issues an *authenticated* request (harmless)
 * instead of the anonymous 401 this branch exists to remove, and the
 * cache is empty before anything can read it, rather than depending on
 * the unmount having been committed by then. `performSignOut`'s own
 * clear stays as the backstop for whatever such a request wrote.
 *
 * React-free on purpose, like `performSignOut` and for the same reason
 * (the unit suite is plain node, no renderer): the local half arrives
 * as a callback — the provider's `setState`s and nothing else. It is
 * called synchronously and its return value is ignored, because it is
 * the one step of sign-out that must not wait for anything, and because
 * `performSignOut` holds the token until its unsubscribe and its logout
 * have gone out: leaving the state first does not take the token out
 * from under them.
 *
 * `leaveRoutes` is the second half, and the state flip alone is not
 * enough for the same reason it looked like it would be: flipping the
 * session's state re-renders `useAuth`'s consumers and nothing else, so
 * the screens behind the dialog never hear about it and stay mounted —
 * and a screen that outlives the session is a screen that can read for
 * one. It arrives as a callback too: routing lives in `app/_layout.tsx`
 * and a store must not import the router (`lib/authStore.tsx` is loaded
 * by node tests that mock `react-native` and nothing else).
 */
export async function endSession(
  client: QueryClient | undefined,
  leaveSession: () => void,
  leaveRoutes?: () => void,
): Promise<void> {
  leaveSession();
  // The screens go next, and before `performSignOut` reaches the token:
  // the render that leaves them can want a read of its own, and one that
  // goes out now still carries a valid bearer.
  leaveRoutes?.();
  // Then the cache, still ahead of the token: what a late render can
  // build from here is an authenticated request rather than the 401 this
  // branch removes, and nothing of the previous account's is left in
  // memory for a Back during `performSignOut`'s round trip.
  client?.clear();
  await performSignOut(client);
}

/**
 * Throw away whatever the cache holds for the session that just ended —
 * or that never started.
 *
 * `performSignOut` already does this on the way out; this is the same
 * clear on the way in, and it is not symmetry for its own sake. On a
 * device, every authenticated read attempted before sign-in (the
 * notifications list and the unread count both used to fire anonymously)
 * was answered 401, and the query kept that error — so the first screen
 * after signing in could paint "Sign in again" over a perfectly live
 * session, because nothing had invalidated the anonymous failure. The
 * reads are `enabled` only while signed in now, and this makes the
 * transition trustworthy even for a query that was already mounted.
 */
function resetCacheForNewSession(client?: QueryClient): void {
  client?.clear();
}

type AuthValue = {
  status: AuthStatus;
  user: AuthUser | null;
  /** True while the session is an admin's (kept true while
   *  impersonating — the API derives it from the token's `adminId`). */
  isAdmin: boolean;
  /** Whose session this is while impersonating, null otherwise. */
  impersonating: Impersonating;
  /**
   * Re-read `/auth/me` after an identity swap (impersonate / stop):
   * `performSignOut`'s cache clear, then `restoreSession()`, then the
   * same state writes including the new two — with NO token drop.
   */
  adoptSession: () => Promise<void>;
  /** The number between the two screens: a code has been asked for and
   *  not yet verified. The verify screen is the only thing that reads it. */
  pendingPhone: string | null;
  requestCode: (phoneNumber: string) => Promise<void>;
  verifyCode: (code: string) => Promise<{ requiresProfile: boolean }>;
  completeProfile: (displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * `DELETE /users/me`, then `signOut`'s local reset. The session has to
   * be gone before the screen navigates: the login screen's guard reads
   * `status`, and a provider that still says `signed-in` bounces the
   * person straight back to the trips list of an account that no longer
   * exists.
   */
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({
  children,
  leaveRoutes,
}: {
  children: ReactNode;
  /**
   * How to leave the screens the session was showing — supplied by
   * `app/_layout.tsx`, called on sign-out before `performSignOut` empties
   * the cache, and optional because bare node renders of this provider
   * (the restore test) have no navigator above them. See `endSession`
   * for why the order is the fix rather than a detail.
   */
  leaveRoutes?: () => void;
}) {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [impersonating, setImpersonating] = useState<Impersonating>(null);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);

  // `AuthProvider` renders beneath the `QueryClientProvider` in
  // `app/_layout.tsx`, so the client comes from the hook — never from a
  // module singleton (the layout makes a fresh client per mount). The
  // `try` is for bare node renders with no provider above the store
  // (the restore test renders `AuthProvider` alone): the hook call
  // itself is unconditional, so hook order never changes — only the
  // "no client" throw is absorbed, and the cache clears then skip what
  // they have no cache for. It is resolved before the callbacks because
  // they both clear the cache on a successful sign-in.
  let queryClient: QueryClient | undefined;
  try {
    queryClient = useQueryClient();
  } catch {
    queryClient = undefined;
  }

  // Cold start: a stored token is revalidated once, then the gate in
  // `app/index.tsx` decides. The cancel flag is for the unmount race
  // only — nothing here retries or refreshes.
  useEffect(() => {
    let cancelled = false;
    restoreSession(() => {
      // Fire-and-forget, and the restore never awaits it: the trips
      // read now races `/auth/me` instead of queueing behind it, so
      // the list paints from the prefetch rather than from a second
      // round trip once the session resolves.
      //
      // What a stale token costs is *not* one wasted request. A 401
      // reaches the shared boundary in `lib/api.ts`, whose listener
      // signs the session out — which is the right answer for a dead
      // token, and the same answer the trips screen's own read would
      // have produced a moment later. The difference this introduces
      // is that the 401 can now land while `/auth/me` is still in
      // flight, so a token that expires in the millisecond between the
      // two requests signs out a restore that had already succeeded.
      // Accepted rather than papered over: the window is two requests
      // wide, the outcome is what the next read would do anyway, and
      // the alternative is a bypass flag on the one boundary the app
      // deliberately centralised. The failure itself is swallowed here
      // (`prefetchQuery` resolves rather than throws when the read
      // fails, so the `catch` is belt and braces), and the next cache
      // clear — sign-out, or the sign-in path — drops whatever the
      // prefetch wrote. On a `requiresProfile` redirect it costs one
      // request, accepted here rather than special-cased.
      void queryClient?.prefetchQuery(tripsListOptions()).catch(() => {});
    })
      .then((result) => {
        if (cancelled) return;
        const patch = providerPatchFromRestore(result);
        setUser(patch.user);
        setIsAdmin(patch.isAdmin);
        setImpersonating(patch.impersonating);
        setStatus(patch.status);
        setSignedIn(patch.status === "signed-in");
      })
      .catch(() => {
        if (cancelled) return;
        setIsAdmin(false);
        setImpersonating(null);
        setStatus("signed-out");
        setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const requestCode = useCallback(async (phoneNumber: string) => {
    // Real endpoint now: client-side validation lives in lib/phone.ts
    // (via lib/queries/auth), so a bad number throws before any fetch.
    await requestAuthCode({ phoneNumber, smsConsent: true });
    setPendingPhone(phoneNumber);
  }, []);

  // Adopt the identity the token actually names. A sign-in step cannot
  // know it from its own reply — `verifyCodeResponseSchema` carries no
  // role — so an admin who signed in would be treated as a plain user
  // until the app was reloaded and the profile screen would offer them
  // no Admin group. The read is `restoreSession`'s, so the answer is
  // the server's rather than a guess.
  const adoptIdentity = useCallback(
    async ({ failClosed = false }: { failClosed?: boolean } = {}) => {
      const result = await restoreSession();
      // Reading the token back is how the two failures are told apart:
      // `restoreSession` clears it on a 401 and keeps it on anything
      // else, so a surviving token means the READ failed, not the
      // session. See `restorePaint`.
      const tokenSurvived = (await getToken()) !== null;
      const paint = restorePaint(result, tokenSurvived, { failClosed });
      if (paint === "keep") return;
      const patch =
        paint === "adopt"
          ? providerPatchFromRestore(result)
          : { status: "signed-out" as const, user: null, isAdmin: false, impersonating: null };
      setUser(patch.user);
      setIsAdmin(patch.isAdmin);
      setImpersonating(patch.impersonating);
      setStatus(patch.status);
      setSignedIn(patch.status === "signed-in");
    },
    [],
  );

  const verifyCode = useCallback(
    async (code: string) => {
      if (!pendingPhone) throw new Error("Ask for a code first.");
      // The real endpoint: `verifyCode` persists the bearer token via
      // `setToken` and returns the server's `requiresProfile` flag, which
      // decides the next route (see `destinationForRequiresProfile`).
      // No magic-number equality here — a wrong code surfaces as the
      // API's error, mapped to field copy by the caller.
      const { user: apiUser, requiresProfile } = await verifyAuthCode({
        phoneNumber: pendingPhone,
        code,
        smsConsent: true,
      });
      setUser({
        id: apiUser.id,
        phoneNumber: apiUser.phoneNumber,
        displayName: apiUser.displayName ?? "",
        profileComplete: !requiresProfile,
      });
      // A fresh verify starts its own session: not impersonating, and
      // not known-admin (the verify reply carries no identity beyond
      // the user; the next restore adopts whatever the token names).
      setIsAdmin(false);
      setImpersonating(null);
      setStatus("signed-in");
      setSignedIn(true);
      // Anything read while signed out is not this session's answer.
      resetCacheForNewSession(queryClient);
      // Then the identity the token names, for the same reason the
      // reply above cannot supply it.
      await adoptIdentity();

      return { requiresProfile };
    },
    [pendingPhone, queryClient, adoptIdentity],
  );

  const completeProfile = useCallback(async (displayName: string) => {
    // The real endpoint: POSTs `/auth/complete-profile`, persists the
    // refreshed token via `setToken`, and reads the user back from
    // `GET /auth/me` (one source of truth, not a local flag).
    const profile = await completeAuthProfile({ displayName });
    setUser({
      id: profile.id,
      phoneNumber: profile.phoneNumber,
      displayName: profile.displayName,
      profileComplete: true,
    });
    setIsAdmin(false);
    setImpersonating(null);
    setStatus("signed-in");
    setSignedIn(true);
    // Same clear as `verifyCode`: the new session starts from nothing.
    resetCacheForNewSession(queryClient);
    await adoptIdentity();
  }, [queryClient, adoptIdentity]);

  const resetSessionState = useCallback(() => {
    // One place, because two paths end a session and only one of them
    // may run this first. The gate reads `status`, so it follows `user`
    // within the batch — and the whole batch lands before `endSession`
    // starts on the network.
    setUser(null);
    setIsAdmin(false);
    setImpersonating(null);
    setPendingPhone(null);
    setStatus("signed-out");
    setSignedIn(false);
  }, []);

  const signOut = useCallback(
    // Server POST, token drop, and cache clear live in `performSignOut`
    // (best-effort server half: an offline sign-out still clears
    // locally). The local reset and the way out of the session's screens
    // run ahead of all of it — see `endSession` for why the order is the
    // fix rather than a detail.
    () => endSession(queryClient, resetSessionState, leaveRoutes),
    [queryClient, resetSessionState, leaveRoutes],
  );

  // `signOut` plus one request in front. `lib/account.ts` does the DELETE,
  // the token drop and the cache clear; the state below is the same local
  // reset `signOut` does, and here it runs only on success, because a failed
  // delete has to leave a working session behind for the retry — which is
  // also why it cannot run first. What that costs is the refetch
  // `endSession` prevents: `lib/account.ts` empties the cache while the
  // screens are still mounted, so their 401 is still a follow-up. It does
  // not reuse `performSignOut` — see `lib/account.ts` for why the push
  // unsubscribe is the wrong call once the account is gone.
  const deleteAccount = useCallback(async () => {
    await deleteAccountApi(queryClient);
    resetSessionState();
  }, [queryClient, resetSessionState]);

  const adoptSession = useCallback(async () => {
    // `performSignOut`'s cache clear, then the identity the new token
    // names — with NO token drop. The identity changed, so nothing
    // cached for the old session survives.
    //
    // `failClosed` rather than the sign-in default: the paint here is
    // the OLD identity and the token is the NEW one, so a read that
    // fails leaves the app unable to say who it is. Ending the session
    // is the honest answer; the caller's own failure copy is what the
    // person reads.
    queryClient?.clear();
    await adoptIdentity({ failClosed: true });
  }, [queryClient, adoptIdentity]);

  // Mid-session 401 recovery: the shared boundary (`lib/api.ts`)
  // reports a dead token here, and the provider signs out through
  // the same path the button above uses — so every screen stops
  // replaying its failure and the gate lands back on sign-in.
  //
  // The ordering, but not the leaving. `endSession`'s routes step would
  // also take a 401'd person out of the auth flow whose own guards decide
  // where a signed-out reader belongs — `/complete-profile` sends them to
  // the landing, and it is not this path's place to overrule that (the
  // auth journey's guard step failed on exactly that when the two were
  // wired together).
  //
  // What the recovery path needs from the gate above is the read that
  // started it, and it gets that for three of them: `me`, the
  // notifications list and the header's bell are gated on `sessionFlag`,
  // so a dead token cannot set another one going. The screens' own reads
  // are plain suspense reads and cannot take that gate —
  // `useSuspenseQuery` forces `enabled: true` — so for those this path
  // keeps the old behaviour. That is not a regression: it is where the
  // whole app already stood before the gate, and the leaving that removes
  // those observers is the button path's.
  useEffect(() => {
    return onUnauthorized(() => {
      void endSession(queryClient, resetSessionState);
    });
  }, [queryClient, resetSessionState]);

  const value = useMemo(
    () => ({
      status,
      user,
      isAdmin,
      impersonating,
      pendingPhone,
      requestCode,
      verifyCode,
      completeProfile,
      signOut,
      deleteAccount,
      adoptSession,
    }),
    [
      status,
      user,
      isAdmin,
      impersonating,
      pendingPhone,
      requestCode,
      verifyCode,
      completeProfile,
      signOut,
      deleteAccount,
      adoptSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  // The demo session (see `setDemoAuthUser`): while `/demo` is mounted
  // the visitor reads as the fixture's traveler, so `viewerOf` finds a
  // `going` roster row and `canReadRun` opens the real run. Null
  // everywhere else, where the provider's own session applies untouched.
  if (demoAuthUser) {
    return { ...value, status: "signed-in", user: demoAuthUser };
  }
  return value;
}

/**
 * Demo-only session override, set while `/demo` is mounted and cleared
 * on unmount. The anonymous visitor holds no token, so the provider
 * restores signed-out with zero network — and the real detail screen
 * would then lock its run (`canReadRun` needs a `going` viewer). This
 * paints the fixture's traveler as the session instead of weakening
 * the auth gate on any real route: production code paths read `user`
 * exactly as before, and nothing outside `/demo` ever sets this.
 * Revertible with the demo mount itself.
 */
let demoAuthUser: AuthUser | null = null;

export function setDemoAuthUser(user: AuthUser | null): void {
  demoAuthUser = user;
}

/** Whether the demo scope is installed (`components/demo/DemoGuard.tsx` reads this, never the context). */
export function getDemoAuthUser(): AuthUser | null {
  return demoAuthUser;
}

/**
 * Whether an identity is the demo's fixture traveler rather than a real
 * session. The fixture is viewer identity — the demo's own screens need
 * it so `viewerOf` finds the `going` roster row — but it must never
 * count as a session on a real route: every route that redirects or
 * gates on a session (`/`, `/login`, `/verify`, `/complete-profile`)
 * ignores it, so arriving at one with the fixture still installed
 * renders the stranger's page instead of bouncing to `/trips` with no
 * session. Matched on the fixture id, which no real account carries
 * (server ids are UUIDs; the fixture's is the `demo-viewer` literal).
 */
export function isDemoIdentity(
  user: AuthUser | null | undefined,
): boolean {
  return user?.id === DEMO_AUTH_USER.id;
}
