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
const PUSH_ASKED_KEY = "journiful.pushAsked";

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

/** Whether this install has already asked the OS for permission. */
async function wasAsked(): Promise<boolean> {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(PUSH_ASKED_KEY) === "1";
    }
  } catch {
    return false;
  }
  if (Platform.OS === "web") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require("expo-secure-store") as typeof import("expo-secure-store");
    return (await store.getItemAsync(PUSH_ASKED_KEY)) === "1";
  } catch {
    return false;
  }
}

async function rememberAsked(): Promise<void> {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PUSH_ASKED_KEY, "1");
      return;
    }
  } catch {
    // Best-effort: worst case the ask is offered once more.
  }
  if (Platform.OS === "web") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require("expo-secure-store") as typeof import("expo-secure-store");
    await store.setItemAsync(PUSH_ASKED_KEY, "1");
  } catch {
    // Best-effort, as above.
  }
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
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status === "granted") return "granted";
    // Android reports `denied` for a permission that has never been
    // requested, so the OS answer alone cannot tell "not yet asked" from
    // "turned off". Trusting it made a first-run screen greet a new
    // person with "Notifications are off — you turned them off for
    // Journiful", which is a lie about a choice they never made, and it
    // hid the only button that asks. The stored ask flag is what
    // separates the two; `canAskAgain === false` is the OS saying the
    // question cannot be asked again, whatever the flag says.
    if (perms.canAskAgain === false) return "denied";
    return (await wasAsked()) ? "denied" : "undetermined";
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
    // Two shapes of "not granted yet": a genuine `undetermined`, and the
    // `denied` Android reports before it has ever been asked (see
    // `permissionState`). Both are the moment to ask.
    const neverAsked =
      status !== "granted" && (status !== "denied" || !(await wasAsked()));
    if (neverAsked && perms.canAskAgain !== false) {
      await rememberAsked();
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

/**
 * The device's current FCM token, or null. Needs no permission: the
 * token is what a notification would be addressed to, not a grant to
 * receive one.
 */
async function currentDeviceToken(): Promise<string | null> {
  try {
    const { data } = await Notifications.getDevicePushTokenAsync();
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * Delete this install's registrations. Never throws.
 *
 * It deletes every token it can name rather than trusting one:
 *
 * - the caller's, when it has one (the token it just registered);
 * - the stored one, which is what a previous launch wrote;
 * - the **current device token from the OS**, which is the only value
 *   that is certainly right.
 *
 * That last one is not belt-and-braces. On a device, signing out
 * deleted *nothing*: the API logged the `DELETE /push/subscribe`, the
 * body carried a token, and the row for the token the app had actually
 * registered was still there afterwards — so a signed-out phone kept
 * receiving pushes. The stored value is written best-effort (a failed
 * SecureStore write leaves an older token behind), while
 * `getDevicePushTokenAsync()` cannot disagree with the device.
 */
export async function unregisterPush(token?: string): Promise<void> {
  const candidates = new Set<string>();
  if (token) {
    // A named token is exactly what to delete: this is the rotation
    // path, where deleting the token just registered would undo it.
    candidates.add(token);
  } else {
    const stored = await readStoredToken();
    if (stored) candidates.add(stored);
    const device = await currentDeviceToken();
    if (device) candidates.add(device);
  }

  for (const candidate of candidates) {
    try {
      await apiFetch("/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "fcm", token: candidate }),
      });
    } catch {
      // Sign-out must complete even when the network is gone.
    }
  }
  if (!token) await storeToken(null);
}

