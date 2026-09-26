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

/**
 * The channel the API addresses (`channelId` in
 * `apps/api/src/services/push.service.ts`), so the id is a contract
 * between the two sides, not a local detail.
 *
 * It is not `"default"`, the name the Capacitor-era payload used, because
 * Android freezes a channel's sound, importance and vibration at creation
 * and **restores them when a deleted channel is recreated**: the device
 * showed a channel deleted and recreated with a vibration pattern come
 * back with `mVibrationPattern=null`, exactly as before. A new id is the
 * only reliable way to change what a channel asks for, and nothing has
 * shipped, so this is a rename rather than a migration.
 */
const CHANNEL_ID = "journiful-default";

/** The id this app used before the rename. Deleted, never recreated. */
const LEGACY_CHANNEL_ID = "default";

/**
 * What the channel asks for.
 *
 * `sound: "default"` is what a push alerts with; `vibrationPattern` and
 * `enableVibrate` are what a phone in a pocket feels. The emulator pass
 * found the channel created with neither: `dumpsys notification` reported
 * `mSound=content://settings/system/notification_sound` (expo defaults the
 * sound) but `mVibrationPattern=null mVibrationEnabled=false`, because the
 * channel was created with only a name and an importance.
 */
const CHANNEL = {
  name: "Journiful",
  sound: "default",
  vibrationPattern: [0, 250, 250, 250],
  enableVibrate: true,
};

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
    // "turned off" — trusting it greeted a first-run person with "you
    // turned them off for Journiful", which is a lie about a choice they
    // never made, and hid the only button that asks.
    //
    // `canAskAgain` is *not* the tie-breaker either, which a device made
    // plain: a fresh install that had never been asked reported
    // `{"status":"denied","canAskAgain":false,"asked":true}` — expo
    // returns false while the request is still possible, so treating it
    // as "off" reproduced the same lie. The stored ask flag is the only
    // signal that means what it says: asked and not granted is a choice,
    // never asked is not.
    return (await wasAsked()) ? "denied" : "undetermined";
  } catch {
    return "undetermined";
  }
}

export async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    // The old id is deleted rather than reused (see `CHANNEL_ID`). Its
    // notifications go with it, which is the intent: nothing is expected on
    // a channel the app no longer addresses. Its own try: a device without
    // that channel is the normal case, and must not skip the create below.
    try {
      await Notifications.deleteNotificationChannelAsync(LEGACY_CHANNEL_ID);
    } catch {
      // Nothing to delete.
    }
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      ...CHANNEL,
      importance: Notifications.AndroidImportance.HIGH,
    });
  } catch {
    // A missing channel only affects display priority, never sign-in.
  }
}

/**
 * Register the device token, but **never ask** for permission.
 *
 * This is the path the session takes (`setToken`) and the one every
 * launch takes: it registers when permission is already granted and does
 * nothing otherwise. Asking here was a bug the device found — signing in
 * fired the OS prompt before the person had opened anything, the prompt
 * did not appear, Android recorded a denial
 * (`{"status":"denied","canAskAgain":false,"asked":true}`), and from then
 * on the notifications screen said "you turned them off for Journiful"
 * while the one-shot prompt was already spent. Android gives an app one
 * honest ask; it belongs to the button on the notifications screen, which
 * is `askForPush`.
 *
 * Rotating tokens prune the previous row: when the new token differs from
 * the stored one, the old one is deleted after the new registration
 * succeeds.
 */
export async function registerForPush(): Promise<string | null> {
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== "granted") return null;
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
 * Ask for permission, then register — the notifications screen's button,
 * and the only place in the app that prompts.
 *
 * Returns the token, or null when the answer is no or anything fails. A
 * denial is remembered, so the screen can stop offering the ask and point
 * at system settings instead.
 */
export async function askForPush(): Promise<string | null> {
  try {
    const before = await Notifications.getPermissionsAsync();
    if (before.status === "granted") return registerForPush();
    await rememberAsked();
    const asked = await Notifications.requestPermissionsAsync();
    if (asked.status !== "granted") return null;
    return registerForPush();
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

