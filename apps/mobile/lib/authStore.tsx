import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  requestCode as requestAuthCode,
  verifyCode as verifyAuthCode,
  completeProfile as completeAuthProfile,
} from "@/lib/queries/auth";
import { clearToken } from "@/lib/session";

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

type AuthValue = {
  user: AuthUser | null;
  /** The number between the two screens: a code has been asked for and
   *  not yet verified. The verify screen is the only thing that reads it. */
  pendingPhone: string | null;
  requestCode: (phoneNumber: string) => Promise<void>;
  verifyCode: (code: string) => Promise<{ requiresProfile: boolean }>;
  completeProfile: (displayName: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);

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

      return { requiresProfile };
    },
    [pendingPhone],
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
  }, []);

  const signOut = useCallback(() => {
    // Fire-and-forget on purpose: signOut stays synchronous so its
    // public shape does not change when the endpoints arrive.
    void clearToken().catch(() => {});
    setUser(null);
    setPendingPhone(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      pendingPhone,
      requestCode,
      verifyCode,
      completeProfile,
      signOut,
    }),
    [user, pendingPhone, requestCode, verifyCode, completeProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
