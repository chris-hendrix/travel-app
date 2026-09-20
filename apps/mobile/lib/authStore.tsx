import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PHONE_REGEX } from "@journiful/shared/schemas";
import { PROFILE } from "@/mocks/profile";

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

/** What the dev SMS sender always sends (`ENABLE_FIXED_VERIFICATION_CODE`). */
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
    if (!PHONE_REGEX.test(phoneNumber)) {
      throw new Error("That does not look like a number.");
    }
    setPendingPhone(phoneNumber);
  }, []);

  const verifyCode = useCallback(
    async (code: string) => {
      if (!pendingPhone) throw new Error("Ask for a code first.");
      if (code !== DEV_CODE) {
        throw new Error("That code is not right, or it has expired.");
      }

      // The one account that exists: the seeded one is already a person,
      // anyone else is arriving for the first time. The API decides this
      // from the database, not from a magic number.
      const known = pendingPhone === PROFILE.phoneNumber;
      setUser({
        id: known ? PROFILE.id : `user-${pendingPhone.slice(-4)}`,
        phoneNumber: pendingPhone,
        displayName: known ? PROFILE.displayName : "",
        profileComplete: known,
      });

      return { requiresProfile: !known };
    },
    [pendingPhone],
  );

  const completeProfile = useCallback(async (displayName: string) => {
    setUser((current) =>
      current ? { ...current, displayName, profileComplete: true } : current,
    );
  }, []);

  const signOut = useCallback(() => {
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
