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

    // Register listener before calling register() to avoid race condition.
    // Wrap in Promise.race with a 10s timeout in case the event never fires.
    const result = await Promise.race<PushRegistrationResult>([
      new Promise<PushRegistrationResult>((resolve, reject) => {
        let registrationListener: { remove: () => Promise<void> } | null = null;
        let errorListener: { remove: () => Promise<void> } | null = null;

        PushNotifications.addListener("registration", (token: Token) => {
          registrationListener?.remove();
          errorListener?.remove();
          resolve({ token: token.value, platform, provider: "fcm" });
        }).then((handle) => { registrationListener = handle; });

        PushNotifications.addListener("registrationError", (err) => {
          registrationListener?.remove();
          errorListener?.remove();
          reject(new Error(`FCM registration error: ${err.error ?? "unknown"}`));
        }).then((handle) => { errorListener = handle; });

        // Now register — events will be caught by the listeners above
        PushNotifications.register();
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Push registration timed out after 10s")),
          10_000,
        ),
      ),
    ]);

    return result;
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
