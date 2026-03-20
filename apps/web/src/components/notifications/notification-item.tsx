"use client";

import type { ElementType } from "react";
import { Bell, Calendar, MessageCircle, UserPlus } from "lucide-react";
import type { Notification, NotificationType } from "@journiful/shared/types";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const typeIcons: Record<NotificationType, ElementType> = {
  daily_itinerary: Calendar,
  trip_message: MessageCircle,
  trip_update: Bell,
  mutual_invite: UserPlus,
  sms_invite: UserPlus,
};

interface NotificationItemProps {
  notification: Notification;
  onClick: (notification: Notification) => void;
}

export function NotificationItem({
  notification,
  onClick,
}: NotificationItemProps) {
  const Icon = typeIcons[notification.type];
  const isUnread = notification.readAt === null;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 cursor-pointer",
      )}
      onClick={() => onClick(notification)}
    >
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {isUnread ? (
          <span
            className="h-2 w-2 rounded-full bg-primary"
            aria-hidden="true"
          />
        ) : (
          <span className="h-2 w-2" aria-hidden="true" />
        )}
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{notification.title}</p>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {notification.body}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>
    </button>
  );
}
