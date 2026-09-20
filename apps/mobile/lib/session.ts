import { Platform } from "react-native";

/**
 * Where the auth token lives, ahead of the auth endpoints.
 *
 * Native stores it in `expo-secure-store` (Keychain / Keystore). The web
 * export has no secure store, so it falls back to `localStorage`, which is
 * readable by any script on the page and therefore insecure. That is
 * acceptable for review builds only: the web export exists so reviewers
 * can click through the mockup, never as a place a real token lives.
 *
 * `expo-secure-store` has no web implementation, so the native module is
 * loaded lazily behind a `Platform.OS` guard instead of a static import
 * — a static import would pull it into the web bundle and break
 * `npx expo export --platform web`.
 */

const KEY = "journiful.authToken";

function nativeStore() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-secure-store") as typeof import("expo-secure-store");
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }
  return nativeStore().getItemAsync(KEY);
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      localStorage.setItem(KEY, token);
    } catch {
      // Review builds only: losing the token signs the reviewer out.
    }
    return;
  }
  await nativeStore().setItemAsync(KEY, token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing to clear through.
    }
    return;
  }
  await nativeStore().deleteItemAsync(KEY);
}
