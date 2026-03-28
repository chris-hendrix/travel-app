/**
 * Push notification utilities for the Journiful PWA
 */

/**
 * Check if the browser supports push notifications
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/**
 * Get the current notification permission state
 */
export function getPermissionState(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

/**
 * Convert a URL-safe base64 string to a Uint8Array (for applicationServerKey)
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as Uint8Array<ArrayBuffer>;
}

/**
 * Subscribe the browser to push notifications.
 * Returns the PushSubscription object on success, or null if permission denied.
 */
export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<PushSubscription | null> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.ready;
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
  });

  return subscription;
}

/**
 * Get the existing push subscription, if any
 */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}
