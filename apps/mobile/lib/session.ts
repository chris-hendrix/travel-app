import { Platform } from "react-native";

/**
 * Where the auth token lives, ahead of the auth endpoints.
 *
 * Native stores it in `expo-secure-store` (Keychain / Keystore). The web
 * export has no secure store, so it falls back to `localStorage`, which is
 * readable by any script on the page — weaker than the httpOnly cookie
 * session the Next app uses. Since the export became the product surface
 * that is an accepted risk rather than a review-build concession: it is
 * recorded in the root `AGENTS.md`, and the follow-up is cookie auth on web
 * or the native app.
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
  } else {
    await nativeStore().setItemAsync(KEY, token);
  }
  // Push registration follows the session and is best-effort: it must
  // never block sign-in. A dynamic import keeps the static graph free
  // of expo-notifications (see lib/api.ts for the same pattern).
  try {
    const { registerForPush } = await import("@/lib/push");
    await registerForPush();
  } catch {
    // Registration retries on the next launch.
  }
}

export async function clearToken(): Promise<void> {
  // Unregister before the token is dropped: the DELETE needs auth.
  try {
    const { unregisterPush, getStoredPushTokenAsync } = await import("@/lib/push");
    const pushToken = await getStoredPushTokenAsync();
    if (pushToken) await unregisterPush(pushToken);
  } catch {
    // Sign-out completes even when the network is gone.
  }
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
