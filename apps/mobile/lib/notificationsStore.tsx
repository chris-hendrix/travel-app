import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  unreadCount as countUnread,
  type Notification,
} from "@/lib/notifications";
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
  notificationsListOptions,
} from "@/lib/queries/notifications";
import { isSignedIn, subscribe } from "@/lib/sessionFlag";

type NotificationsValue = {
  notifications: Notification[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  /**
   * The list read's state, for the screen gate. Explicit rather than
   * Suspense on purpose: the header's bell reads this same hook
   * outside any Suspense boundary, so a suspending read would crash
   * the chrome. The screen owns the loading/error copy off these.
   */
  status: "pending" | "error" | "success";
  error: unknown;
  retry: () => void;
};

const NotificationsContext = createContext<NotificationsValue | null>(null);

/**
 * Reads are server state now (`notificationsListOptions`, explicit —
 * see `status` above for why not Suspense). Writes go through the API
 * with optimistic cache edits, rollback, and invalidate — the Task 4
 * trips flow shape.
 *
 * The key shape is unchanged, so the notifications screen and the
 * header's bell keep the accessors they already call; only the engine
 * is server instead of memory. The unread count is still derived from
 * the list rows — the server-count badge is Task 2's.
 */
export function NotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  // Signed out there is no list to read, and asking anyway is an anonymous
  // 401 the API counts against its rate limiter — and, before the cache
  // clear on sign-in, the failure that painted "Sign in again" over a live
  // session. `sessionFlag` rather than `useAuth` because this module is
  // rendered by node tests that cannot import `react-native` (see that
  // module's doc comment). The third argument is the server snapshot: these
  // tests render through `react-dom/server`, and during the web prerender
  // the honest answer is the same as the client's — no session, so nothing
  // to fetch.
  const signedIn = useSyncExternalStore(subscribe, isSignedIn, isSignedIn);
  const listQuery = useQuery({
    ...notificationsListOptions(),
    enabled: signedIn,
  });
  const notifications = useMemo(
    () => listQuery.data ?? [],
    [listQuery.data],
  );

  const retry = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
  }, [queryClient]);

  const markReadMutation = useMutation({
    mutationKey: ["notifications", "markRead"],
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.list() });
      const previous =
        queryClient.getQueryData<Notification[]>(notificationKeys.list());
      // The single-read endpoint answers `{success: true}` with no
      // entity, so the optimistic paint IS the read state: stamp
      // `readAt` now, keep the paint on success, restore on failure.
      const readAt = new Date().toISOString();
      if (previous) {
        queryClient.setQueryData<Notification[]>(
          notificationKeys.list(),
          previous.map((notification) =>
            notification.id === id && notification.readAt === null
              ? { ...notification, readAt }
              : notification,
          ),
        );
      }
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
      // The header bell reads the server count
      // (`unreadCountOptions`), not the list rows — so the count key
      // must invalidate alongside the list, or the badge goes stale
      // while the center is fresh.
      queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount(),
      });
    },
  });

  const markAllReadMutation = useMutation({
    mutationKey: ["notifications", "markAllRead"],
    mutationFn: () => markAllNotificationsRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.list() });
      const previous =
        queryClient.getQueryData<Notification[]>(notificationKeys.list());
      // Same `{success: true}` answer shape as the single read: stamp
      // every unread row now. Already-read rows keep their own stamp.
      const readAt = new Date().toISOString();
      if (previous) {
        queryClient.setQueryData<Notification[]>(
          notificationKeys.list(),
          previous.map((notification) =>
            notification.readAt === null
              ? { ...notification, readAt }
              : notification,
          ),
        );
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
      // Same server-count badge as the single read: invalidate the
      // count key alongside the list.
      queryClient.invalidateQueries({
        queryKey: notificationKeys.unreadCount(),
      });
    },
  });

  const value = useMemo(
    () => ({
      notifications,
      unreadCount: countUnread(notifications),
      markRead: (id: string) => markReadMutation.mutateAsync(id),
      markAllRead: () => markAllReadMutation.mutateAsync(),
      status: listQuery.status,
      error: listQuery.error,
      retry,
    }),
    [notifications, markReadMutation, markAllReadMutation, listQuery.status, listQuery.error, retry],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsValue {
  const value = useContext(NotificationsContext);
  if (!value) {
    throw new Error("useNotifications must be used inside NotificationsProvider");
  }
  return value;
}
