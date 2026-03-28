"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import {
  isPushSupported,
  getPermissionState,
  subscribeToPush,
  getExistingSubscription,
} from "@/lib/push-notifications";
import type { PushSubscriptionInput } from "@journiful/shared/types";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const pushKeys = {
  vapidPublicKey: ["push", "vapid-public-key"] as const,
  subscription: ["push", "subscription"] as const,
};

// ---------------------------------------------------------------------------
// VAPID public key query
// ---------------------------------------------------------------------------

export function useVapidPublicKey() {
  return useQuery({
    queryKey: pushKeys.vapidPublicKey,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const response = await apiRequest<{ publicKey: string }>(
        "/push/vapid-public-key",
        { signal },
      );
      return response.publicKey;
    },
  });
}

// ---------------------------------------------------------------------------
// Push permission state
// ---------------------------------------------------------------------------

export function usePushPermission() {
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(() => getPermissionState());

  useEffect(() => {
    if (permission === "unsupported") return;

    // Recheck after visibility change (user may have changed in browser settings)
    const handleVisibility = () => {
      if (!document.hidden) {
        setPermission(getPermissionState());
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [permission]);

  return { permission, setPermission };
}

// ---------------------------------------------------------------------------
// Push subscription mutations
// ---------------------------------------------------------------------------

export function usePushSubscription() {
  const queryClient = useQueryClient();

  const subscribe = useMutation({
    mutationFn: async (input: PushSubscriptionInput) => {
      return apiRequest<{ success: true }>("/push/subscribe", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pushKeys.subscription });
    },
  });

  const unsubscribe = useMutation({
    mutationFn: async (endpoint: string) => {
      return apiRequest<{ success: true }>("/push/subscribe", {
        method: "DELETE",
        body: JSON.stringify({ endpoint }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pushKeys.subscription });
    },
  });

  return { subscribe, unsubscribe };
}

// ---------------------------------------------------------------------------
// Full push subscribe flow (permission + browser subscribe + server register)
// ---------------------------------------------------------------------------

export function useSubscribeToPush() {
  const { data: vapidPublicKey } = useVapidPublicKey();
  const { subscribe } = usePushSubscription();
  const { setPermission } = usePushPermission();

  const subscribeToPushFlow = useCallback(async () => {
    if (!vapidPublicKey) return false;
    if (!isPushSupported()) return false;

    const subscription = await subscribeToPush(vapidPublicKey);
    if (!subscription) {
      setPermission(getPermissionState());
      return false;
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys) return false;

    await subscribe.mutateAsync({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh!,
        auth: json.keys.auth!,
      },
      userAgent: navigator.userAgent,
    });

    setPermission("granted");
    return true;
  }, [vapidPublicKey, subscribe, setPermission]);

  return subscribeToPushFlow;
}

// ---------------------------------------------------------------------------
// Unsubscribe flow (browser + server)
// ---------------------------------------------------------------------------

export function useUnsubscribeFromPush() {
  const { unsubscribe } = usePushSubscription();

  return useCallback(async () => {
    const existing = await getExistingSubscription();
    if (!existing) return;

    await unsubscribe.mutateAsync(existing.endpoint);
    await existing.unsubscribe();
  }, [unsubscribe]);
}
