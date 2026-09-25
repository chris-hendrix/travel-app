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
import {
  meOptions,
  requestCode as requestAuthCode,
  verifyCode as verifyAuthCode,
  completeProfile as completeAuthProfile,
  signOutServer,
} from "@/lib/queries/auth";
import type { Profile } from "@/lib/profile";
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

export type RestoreResult =
  | { status: "signed-in"; user: AuthUser }
  | { status: "signed-out"; user: null };

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
 * The cold-start check, run once by `AuthProvider` on mount. A stored
 * token is validated through `meOptions` (one source of truth, not a
 * cached user); no token means signed-out without touching the
 * network. A 401 clears the stale token and signs out — anything else
 * signs out but keeps the token, so a transient failure does not
 * destroy the session (retry behaviour belongs to its own task).
 */
export async function restoreSession(): Promise<RestoreResult> {
  const token = await getToken();
  if (!token) return { status: "signed-out", user: null };
  try {
    const options = meOptions();
    const profile = await options.queryFn!({
      queryKey: options.queryKey,
    } as never);
    return { status: "signed-in", user: authUserFromProfile(profile) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearToken();
    }
    return { status: "signed-out", user: null };
  }
}

/**
 * The full sign-out, testable without React: tell the server
 * (best-effort — a dead network still signs out locally), drop the
 * bearer token, and empty the whole query cache so no signed-in data
 * survives for the next account. The provider's `signOut` is a thin
 * wrapper that supplies its own `useQueryClient()` client and then
 * resets the local auth state.
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
  /** The number between the two screens: a code has been asked for and
   *  not yet verified. The verify screen is the only thing that reads it. */
  pendingPhone: string | null;
  requestCode: (phoneNumber: string) => Promise<void>;
  verifyCode: (code: string) => Promise<{ requiresProfile: boolean }>;
  completeProfile: (displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [user, setUser] = useState<AuthUser | null>(null);
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
    restoreSession()
      .then((result) => {
        if (cancelled) return;
        setUser(result.user);
        setStatus(result.status);
        setSignedIn(result.status === "signed-in");
      })
      .catch(() => {
        if (cancelled) return;
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
      setStatus("signed-in");
      setSignedIn(true);
      // Anything read while signed out is not this session's answer.
      resetCacheForNewSession(queryClient);

      return { requiresProfile };
    },
    [pendingPhone, queryClient],
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
    setStatus("signed-in");
    setSignedIn(true);
    // Same clear as `verifyCode`: the new session starts from nothing.
    resetCacheForNewSession(queryClient);
  }, [queryClient]);


  const signOut = useCallback(async () => {
    // Server POST, token drop, and cache clear live in `performSignOut`
    // (best-effort server half: an offline sign-out still clears
    // locally). The gate reads `status`, so it must follow `user`.
    await performSignOut(queryClient);
    setUser(null);
    setPendingPhone(null);
    setStatus("signed-out");
    setSignedIn(false);
  }, [queryClient]);

  // Mid-session 401 recovery: the shared boundary (`lib/api.ts`)
  // reports a dead token here, and the provider signs out through
  // the same path the button above uses — so every screen stops
  // replaying its failure and the gate lands back on sign-in.
  useEffect(() => {
    return onUnauthorized(() => {
      void performSignOut(queryClient).then(() => {
        setUser(null);
        setPendingPhone(null);
        setStatus("signed-out");
        setSignedIn(false);
      });
    });
  }, [queryClient]);

  const value = useMemo(
    () => ({
      status,
      user,
      pendingPhone,
      requestCode,
      verifyCode,
      completeProfile,
      signOut,
    }),
    [
      status,
      user,
      pendingPhone,
      requestCode,
      verifyCode,
      completeProfile,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
