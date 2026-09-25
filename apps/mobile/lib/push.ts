/**
 * The push client: permission, channel, and registration against the
 * API's existing push contract.
 *
 * No Expo push service is involved: `getDevicePushTokenAsync()` returns
 * the raw FCM token, and the API delivers through the Admin SDK
 * directly (`POST /push/subscribe {token, provider:"fcm",
 * platform:"android"}`, `DELETE /push/subscribe {provider, token}`).
 *
 * Everything here is best-effort: a failed registration never throws
 * and never blocks sign-in. Registration is retried on the next launch
 * and the next sign-in.
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { apiFetch } from "@/lib/api";

const PUSH_TOKEN_KEY = "journiful.pushToken";

export type PushPermission = "granted" | "denied" | "undetermined";

function storedTokenSync(): string | null {
  // localStorage when it exists (web export and unit tests); the
  // native branch below only runs on a device, never in Node.
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
  return null;
}

async function nativePushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require("expo-secure-store") as typeof import("expo-secure-store");
    return await store.getItemAsync(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function readStoredToken(): Promise<string | null> {
  return storedTokenSync() ?? nativePushToken();
}

async function storeToken(token: string | null): Promise<void> {
  try {
    if (typeof localStorage !== "undefined") {
      if (token) localStorage.setItem(PUSH_TOKEN_KEY, token);
      else localStorage.removeItem(PUSH_TOKEN_KEY);
      return;
    }
  } catch {
    // Best-effort; registration retries on next launch.
  }
  if (Platform.OS === "web") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require("expo-secure-store") as typeof import("expo-secure-store");
    if (token) await store.setItemAsync(PUSH_TOKEN_KEY, token);
    else await store.deleteItemAsync(PUSH_TOKEN_KEY);
  } catch {
    // Best-effort; registration retries on next launch.
  }
}

export async function permissionState(): Promise<PushPermission> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") return "granted";
    if (status === "denied") return "denied";
    return "undetermined";
  } catch {
    return "undetermined";
  }
}

export async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Journiful",
      importance: Notifications.AndroidImportance.HIGH,
    });
  } catch {
    // A missing channel only affects display priority, never sign-in.
  }
}

/**
 * Ask (if needed), create the channel, fetch the FCM device token and
 * register it. Returns the token, or null when permission is denied or
 * anything fails. Rotating tokens prune the previous row: when the new
 * token differs from the stored one, the old one is deleted after the
 * new registration succeeds.
 */
export async function registerForPush(): Promise<string | null> {
  try {
    const perms = await Notifications.getPermissionsAsync();
    let status = perms.status;
    if (status !== "granted" && status !== "denied") {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== "granted") return null;
    await ensureChannel();
    const { data } = await Notifications.getDevicePushTokenAsync();
    if (!data) return null;
    const previous = await readStoredToken();
    await apiFetch("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: data,
        provider: "fcm",
        platform: "android",
      }),
    });
    if (previous && previous !== data) {
      await unregisterPush(previous).catch(() => {});
    }
    await storeToken(data);
    return data;
  } catch {
    return null;
  }
}

/** Delete a registration. Never throws. */
export async function unregisterPush(token: string): Promise<void> {
  try {
    await apiFetch("/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "fcm", token }),
    });
  } catch {
    // Sign-out must complete even when the network is gone.
  } finally {
    const current = storedTokenSync();
    if (current === token) await storeToken(null);
    else if (current === null && Platform.OS !== "web") {
      // Native-kept token: clear it too.
      await storeToken(null);
    }
  }
}

/** The token currently stored beside the session, if any (sync web/test path). */
export function getStoredPushToken(): string | null {
  return storedTokenSync();
}

/** Async variant that also checks SecureStore on native. */
export async function getStoredPushTokenAsync(): Promise<string | null> {
  return readStoredToken();
}
