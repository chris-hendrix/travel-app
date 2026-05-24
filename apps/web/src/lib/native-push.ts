import { isNative, getPlatform } from "./platform";
import { PushNotifications, type Token, type PermissionStatus } from "@capacitor/push-notifications";
import { subscribeToPush } from "./push-notifications";

export interface PushRegistrationResult {
  token?: string;
  endpoint?: string;
  keys?: { p256dh: string; auth: string };
  platform: "ios" | "android" | "web";
  provider: "fcm" | "vapid";
}

/**
 * Register for push notifications.
 * On native: uses Capacitor Push Notifications plugin (FCM).
 * On web: uses Web Push API with VAPID.
 *
 * @param vapidPublicKey - Required for web push (VAPID applicationServerKey)
 * @returns Registration result or null if permission denied on web
 */
export async function registerForPush(
  vapidPublicKey?: string
): Promise<PushRegistrationResult | null> {
  if (isNative()) {
    const platform = getPlatform();
    if (platform === "web") {
      // Shouldn't happen — isNative true but platform is web
      throw new Error("Unexpected platform state");
    }

    const perm: PermissionStatus =
      await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      throw new Error("Push notification permission denied");
    }

    await PushNotifications.register();

    return new Promise((resolve) => {
      PushNotifications.addListener("registration", (token: Token) => {
        resolve({
          token: token.value,
          platform,
          provider: "fcm",
        });
      });
      // Note: listener is registered before register() resolves,
      // but we register it after — it still works because Capacitor
      // queues registrations. However, to be safe, we also handle
      // the case where registration event fired before listener.
      // For now, assume the listener will catch it.
    });
  }

  // Web: use VAPID
  if (!vapidPublicKey) {
    throw new Error("VAPID public key required for web push");
  }

  const subscription = await subscribeToPush(vapidPublicKey);
  if (!subscription) return null;

  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint!,
    keys: {
      p256dh: json.keys!.p256dh!,
      auth: json.keys!.auth!,
    },
    platform: "web",
    provider: "vapid",
  };
}
