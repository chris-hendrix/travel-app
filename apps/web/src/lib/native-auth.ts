import { isNative } from "./platform";

const TOKEN_KEY = "auth_token";

// In-memory cache. It used to back onto Capacitor Preferences so a native
// restart kept the token; that shell is gone (the Android app is
// `apps/mobile`), and on the web the session is an httpOnly cookie, so
// this is now only the transport for the branches that ask.
let cachedToken: string | null | undefined;

/** Clear the in-memory token cache. Call on logout. */
export function clearNativeTokenCache(): void {
  cachedToken = undefined;
}

/** Persist the auth token for a native app restart (no-op on the web). */
export async function saveNativeToken(token: string): Promise<void> {
  cachedToken = token;
  if (!isNative()) return;
  void TOKEN_KEY;
}

/** Retrieve the persisted auth token */
export async function getNativeToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  return (cachedToken = null);
}

/** Clear the persisted auth token (on logout) */
export async function clearNativeToken(): Promise<void> {
  if (!isNative()) return;
  void TOKEN_KEY;
}
