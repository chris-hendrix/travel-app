import { isNative } from "./platform";

const TOKEN_KEY = "auth_token";

// In-memory cache to avoid async Capacitor Preferences bridge on every request
let cachedToken: string | null | undefined;

/** Clear the in-memory token cache. Call on logout. */
export function clearNativeTokenCache(): void {
  cachedToken = undefined;
}

/** Persist the auth token for native app restarts */
export async function saveNativeToken(token: string): Promise<void> {
  cachedToken = token;
  if (!isNative()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: TOKEN_KEY, value: token });
  } catch {
    // Preferences not available (e.g., not synced with native project)
  }
}

/** Retrieve the persisted auth token */
export async function getNativeToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  if (!isNative()) return (cachedToken = null);
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    cachedToken = value || null;
    return cachedToken;
  } catch {
    return (cachedToken = null);
  }
}

/** Clear the persisted auth token (on logout) */
export async function clearNativeToken(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: TOKEN_KEY });
  } catch {
    // Preferences not available
  }
}
