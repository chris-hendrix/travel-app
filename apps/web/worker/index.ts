/// <reference lib="webworker" />

// Cast self to ServiceWorkerGlobalScope for type safety in event handlers
const sw = self as unknown as ServiceWorkerGlobalScope;

/**
 * Handle incoming push notifications.
 * Payload expected: { title, body, url, tag }
 */
sw.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};

  event.waitUntil(
    sw.registration.showNotification(data.title ?? "Journiful", {
      body: data.body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/badge-72x72.png",
      tag: data.tag,
      data: { url: data.url ?? "/" },
    }),
  );
});

/**
 * Handle notification click — open or focus the correct URL.
 */
sw.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = (event.notification.data?.url as string) ?? "/";

  event.waitUntil(
    sw.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        const existing = windowClients.find(
          (c) => new URL(c.url).pathname === url,
        );
        if (existing) return existing.focus();
        return sw.clients.openWindow(url);
      }),
  );
});
