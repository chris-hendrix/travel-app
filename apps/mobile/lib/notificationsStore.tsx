import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { NOTIFICATIONS } from "@/mocks/notifications";
import {
  unreadCount as countUnread,
  type Notification,
} from "@/lib/notifications";

type NotificationsValue = {
  notifications: Notification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
};

const NotificationsContext = createContext<NotificationsValue | null>(null);

/**
 * In-memory notifications. Stands in for the API so read state is real —
 * the header's unread dot and the dialog read the same store, so marking
 * read is visible in both places. Same call sites will hit the server
 * later.
 */
export function NotificationsProvider({
  children,
  initial = NOTIFICATIONS,
}: {
  children: ReactNode;
  initial?: Notification[];
}) {
  const [notifications, setNotifications] = useState<Notification[]>(initial);

  const markRead = useCallback((id: string) => {
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id && notification.readAt === null
          ? { ...notification, readAt }
          : notification,
      ),
    );
  }, []);

  const markAllRead = useCallback(() => {
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((notification) =>
        notification.readAt === null ? { ...notification, readAt } : notification,
      ),
    );
  }, []);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount: countUnread(notifications),
      markRead,
      markAllRead,
    }),
    [notifications, markRead, markAllRead],
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
