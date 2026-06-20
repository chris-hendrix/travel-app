import { isNative } from "./platform";

const TOKEN_KEY = "auth_token";

/** Persist the auth token for native app restarts */
export async function saveNativeToken(token: string): Promise<void> {
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
  if (!isNative()) return null;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    return value || null;
  } catch {
    return null;
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
