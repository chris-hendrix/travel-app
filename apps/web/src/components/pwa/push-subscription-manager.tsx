"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/app/providers/auth-provider";
import { isPushSupported, getPermissionState, getExistingSubscription } from "@/lib/push-notifications";
import {
  useVapidPublicKey,
  usePushSubscription,
} from "@/hooks/use-push-notifications";
import { subscribeToPush } from "@/lib/push-notifications";
import { isNative } from "@/lib/platform";
import { registerForPush } from "@/lib/native-push";

/**
 * Manages push subscription lifecycle in response to auth state changes.
 *
 * - On login: if permission is already granted and no active subscription,
 *   re-subscribes automatically.
 * - On logout: removes the push subscription from both the browser and server.
 *
 * Rendered once in the root layout.
 */
export function PushSubscriptionManager() {
  const { user } = useAuth();
  const { data: vapidPublicKey } = useVapidPublicKey();
  const { subscribe, unsubscribe } = usePushSubscription();
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    // Allow native to proceed even without web PushManager support
    if (!isNative() && !isPushSupported()) return;

    const currentUserId = user?.id ?? null;
    const wasLoggedIn = prevUserId.current !== null;
    const isLoggedIn = currentUserId !== null;

    // Detect logout
    if (wasLoggedIn && !isLoggedIn) {
      if (isNative()) {
        import("@/lib/native-auth").then(async ({ getNativeToken }) => {
          const token = await getNativeToken();
          if (token) {
            await unsubscribe.mutateAsync({ provider: "fcm", token }).catch(() => {
              // Server-side removal failed — server cleans on next failed push
            });
          }
        });
      } else {
        getExistingSubscription().then(async (existing) => {
          if (existing) {
            try {
              await unsubscribe.mutateAsync({ provider: "vapid", endpoint: existing.endpoint });
            } catch {
              // Server-side removal failed — still unsubscribe locally
            }
            await existing.unsubscribe();
          }
        });
      }
    }

    // Detect login (or mount with user already logged in)
    if (isLoggedIn) {
      if (isNative()) {
        // Native: use Capacitor Push Notifications (FCM)
        registerForPush()
          .then(async (result) => {
            if (result && result.provider === "fcm") {
              try {
                await subscribe.mutateAsync({
                  token: result.token!,
                  platform: result.platform as "ios" | "android",
                  provider: "fcm" as const,
                });
              } catch {
                // Non-critical — registration will be retried on next visit
              }
            }
          })
          .catch((err) => {
            console.error("Native push registration failed:", err);
          });
      } else if (vapidPublicKey && getPermissionState() === "granted") {
        getExistingSubscription().then(async (existing) => {
          if (existing) {
            // Re-register with server (idempotent upsert)
            const json = existing.toJSON();
            if (json.endpoint && json.keys) {
              try {
                await subscribe.mutateAsync({
                  endpoint: json.endpoint,
                  keys: {
                    p256dh: json.keys.p256dh!,
                    auth: json.keys.auth!,
                  },
                  userAgent: navigator.userAgent,
                });
              } catch {
                // Non-critical — subscription will be retried on next visit
              }
            }
          } else {
            // Permission granted but no subscription — re-subscribe
            const subscription = await subscribeToPush(vapidPublicKey);
            if (subscription) {
              const json = subscription.toJSON();
              if (json.endpoint && json.keys) {
                try {
                  await subscribe.mutateAsync({
                    endpoint: json.endpoint,
                    keys: {
                      p256dh: json.keys.p256dh!,
                      auth: json.keys.auth!,
                    },
                    userAgent: navigator.userAgent,
                  });
                } catch {
                  // Non-critical
                }
              }
            }
          }
        });
      }
    }

    prevUserId.current = currentUserId;
  }, [user?.id, vapidPublicKey]);

  return null;
}
