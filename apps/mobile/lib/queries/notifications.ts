import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toNotification } from "@/lib/mapping";
import type { Notification } from "@/lib/notifications";
import type { GetNotificationsResponse } from "@journiful/shared/types";

/**
 * Inline mirror of `successResponseSchema`
 * (`shared/schemas/common.ts`): `{success: true}`. Both mark-as-read
 * endpoints answer with it and no entity, so the mutations resolve
 * void and the cache paint in the store is the read state. zod is not
 * a mobile dep, so the shape is declared inline (the trips/auth
 * precedent).
 */
export type MarkReadResponse = {
  success: true;
};

/** Key factory for the notifications domain: `all` / `list`. */
export const notificationKeys = {
  all: ["notifications"] as const,
  list: () => [...notificationKeys.all, "list"] as const,
};

/**
 * Notifications list query: `GET /notifications`
 * (`apps/api/src/routes/notification.routes.ts:71`, response
 * `notificationListResponseSchema` in
 * `shared/schemas/notification.ts`).
 *
 * Rows map through `toNotification` (Phase 1 Task 4 — 1:1 minus the
 * caller-owned `userId`). Server order passes through untouched:
 * sorting stays with the caller's pure helper (`newestFirst` in
 * `lib/notifications.ts`), not the query. No pagination params are
 * sent: the endpoint defaults to 20 rows, which is the whole center
 * for v1.
 */
export const notificationsListOptions = () =>
  queryOptions({
    queryKey: notificationKeys.list(),
    queryFn: async (): Promise<Notification[]> =>
      (await apiFetch<GetNotificationsResponse>("/notifications"))
        .notifications.map(toNotification),
  });

/**
 * `PATCH /notifications/:notificationId/read`
 * (`apps/api/src/routes/notification.routes.ts:167`). Answers
 * `{success: true}` with no entity — the store paints `readAt`
 * optimistically and keeps the paint on success.
 */
export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch<MarkReadResponse>(`/notifications/${id}/read`, {
    method: "PATCH",
  });
}

/** Mutation wrapper for callers that fire `markNotificationRead` via TanStack Query. */
export const markNotificationReadOptions = () =>
  mutationOptions({
    mutationKey: ["notifications", "markRead"],
    mutationFn: (id: string) => markNotificationRead(id),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { markNotificationReadOptions as markNotificationReadMutation };

/**
 * `PATCH /notifications/read-all`
 * (`apps/api/src/routes/notification.routes.ts:186`). Unscoped in v1:
 * no `tripId` body is sent, so every unread row is marked. Same
 * `{success: true}` answer shape as the single-read endpoint.
 */
export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch<MarkReadResponse>("/notifications/read-all", {
    method: "PATCH",
  });
}

/** Mutation wrapper for callers that fire `markAllNotificationsRead` via TanStack Query. */
export const markAllNotificationsReadOptions = () =>
  mutationOptions({
    mutationKey: ["notifications", "markAllRead"],
    mutationFn: () => markAllNotificationsRead(),
  });

/** Alias kept so call sites can name the mutation, not the options. */
export { markAllNotificationsReadOptions as markAllNotificationsReadMutation };
