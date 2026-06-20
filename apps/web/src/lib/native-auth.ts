import { Preferences } from "@capacitor/preferences";
import { isNative } from "./platform";

const TOKEN_KEY = "auth_token";

/** Persist the auth token for native app restarts */
export async function saveNativeToken(token: string): Promise<void> {
  if (!isNative()) return;
  await Preferences.set({ key: TOKEN_KEY, value: token });
}

/** Retrieve the persisted auth token (returns null if not native or not stored) */
export async function getNativeToken(): Promise<string | null> {
  if (!isNative()) return null;
  const { value } = await Preferences.get({ key: TOKEN_KEY });
  return value || null;
}

/** Clear the persisted auth token (on logout) */
export async function clearNativeToken(): Promise<void> {
  if (!isNative()) return;
  await Preferences.remove({ key: TOKEN_KEY });
}
