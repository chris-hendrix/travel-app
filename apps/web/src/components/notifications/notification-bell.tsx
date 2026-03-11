"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useUnreadCount,
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
} from "@/hooks/use-notifications";
import { ErrorBoundary } from "@/components/error-boundary";
import type { Notification } from "@tripful/shared/types";
import { NotificationItem } from "./notification-item";

export function NotificationBell() {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: unreadCount } = useUnreadCount();

  const displayCount = useMemo(
    () =>
      unreadCount !== undefined && unreadCount > 0
        ? unreadCount > 9
          ? "9+"
          : String(unreadCount)
        : null,
    [unreadCount],
  );

  const ariaLabel = useMemo(
    () =>
      unreadCount !== undefined && unreadCount > 0
        ? `Notifications, ${unreadCount} unread`
        : "Notifications",
    [unreadCount],
  );

  function handleViewAll() {
    setPopoverOpen(false);
    setSheetOpen(true);
  }

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-lg"
            aria-label={ariaLabel}
          >
            <Bell />
            {displayCount ? (
              <span
                aria-live="polite"
                key={displayCount}
                className="absolute -top-1 -right-1 flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-xs font-medium text-destructive-foreground h-[18px] motion-safe:animate-[badgePulse_600ms_ease-in-out]"
              >
                {displayCount}
              </span>
            ) : (
              <span aria-live="polite" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[calc(100vw-2rem)] sm:w-[380px] p-0"
          align="end"
        >
          <Suspense fallback={null}>
            <ErrorBoundary>
              <NotificationPreview
                onClose={() => setPopoverOpen(false)}
                onViewAll={handleViewAll}
              />
            </ErrorBoundary>
          </Suspense>
        </PopoverContent>
      </Popover>

      <NotificationSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}

function NotificationPreview({
  onClose,
  onViewAll,
}: {
  onClose: () => void;
  onViewAll: () => void;
}) {
  const router = useRouter();
  const { data, isLoading, hasNextPage } = useNotifications();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const notifications = data?.pages.flatMap((p) => p.notifications) ?? [];
  const hasUnread = notifications.some((n) => n.readAt === null);
  const hasMore = hasNextPage ?? false;

  function handleNotificationClick(notification: Notification) {
    if (notification.readAt === null) {
      markAsRead.mutate(notification.id);
    }
    if (notification.tripId) {
      if (
        notification.type === "trip_message" &&
        notification.data?.messageId
      ) {
        router.push(`/trips/${notification.tripId}#discussion`);
      } else {
        router.push(`/trips/${notification.tripId}`);
      }
    }
    onClose();
  }

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-4 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <EmptyState variant="inline" icon={Bell} title="No notifications yet" />
    );
  }

  return (
    <div className="max-h-[480px] overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">Notifications</h2>
        {hasUnread && (
          <Button
            variant="ghost"
            size="xs"
            className="text-sm text-primary"
            onClick={() => markAllAsRead.mutate(undefined)}
          >
            Mark all as read
          </Button>
        )}
      </div>
      <Separator />
      {notifications.map((notification, index) => (
        <div key={notification.id}>
          <NotificationItem
            notification={notification}
            onClick={handleNotificationClick}
          />
          {index < notifications.length - 1 && <Separator />}
        </div>
      ))}
      {hasMore && (
        <>
          <Separator />
          <div className="flex justify-center py-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-sm text-muted-foreground"
              onClick={onViewAll}
            >
              View all notifications
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function NotificationSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-3xl font-playfair tracking-tight">
            Notifications
          </SheetTitle>
          <SheetDescription className="sr-only">
            View all your notifications
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {open && (
            <NotificationSheetBody onClose={() => onOpenChange(false)} />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function NotificationSheetBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useNotifications();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const notifications = data?.pages.flatMap((p) => p.notifications) ?? [];
  const hasMore = hasNextPage ?? false;
  const hasUnread = notifications.some((n) => n.readAt === null);

  function handleNotificationClick(notification: Notification) {
    if (notification.readAt === null) {
      markAsRead.mutate(notification.id);
    }
    if (notification.tripId) {
      if (
        notification.type === "trip_message" &&
        notification.data?.messageId
      ) {
        router.push(`/trips/${notification.tripId}#discussion`);
      } else {
        router.push(`/trips/${notification.tripId}`);
      }
    }
    onClose();
  }

  if (isLoading) {
    return (
      <div className="py-4">
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-4 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-10">
        <Bell className="mb-2 size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No notifications yet</p>
      </div>
    );
  }

  return (
    <div className="max-h-[400px] overflow-y-auto">
      {hasUnread && (
        <>
          <div className="flex items-center justify-end py-2">
            <Button
              variant="ghost"
              size="xs"
              className="text-sm text-primary"
              onClick={() => markAllAsRead.mutate(undefined)}
            >
              Mark all as read
            </Button>
          </div>
          <Separator />
        </>
      )}
      {notifications.map((notification, index) => (
        <div key={notification.id}>
          <NotificationItem
            notification={notification}
            onClick={handleNotificationClick}
          />
          {index < notifications.length - 1 && <Separator />}
        </div>
      ))}
      {hasMore && (
        <>
          <Separator />
          <div className="flex justify-center py-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-sm text-muted-foreground"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? "Loading..." : "Load more"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
