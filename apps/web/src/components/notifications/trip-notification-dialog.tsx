"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { Notification } from "@tripful/shared/types";
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
} from "@/hooks/use-notifications";
import { NotificationItem } from "./notification-item";

interface TripNotificationDialogProps {
  tripId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripNotificationDialog({
  tripId,
  open,
  onOpenChange,
}: TripNotificationDialogProps) {
  const router = useRouter();
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useNotifications({ tripId });
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

    onOpenChange(false);
  }

  function handleMarkAllAsRead() {
    markAllAsRead.mutate({ tripId });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="text-3xl font-[family-name:var(--font-righteous)] tracking-tight">
            Notifications
          </SheetTitle>
          <SheetDescription className="sr-only">
            View notifications for this trip
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {isLoading ? (
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
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-10">
              <Bell className="mb-2 size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No notifications for this trip
              </p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              {hasUnread && (
                <>
                  <div className="flex items-center justify-end py-2">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-sm text-primary"
                      onClick={handleMarkAllAsRead}
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
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
