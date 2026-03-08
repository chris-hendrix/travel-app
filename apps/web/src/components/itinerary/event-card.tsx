"use client";

import { memo } from "react";
import { MapPin } from "lucide-react";
import type { Event } from "@tripful/shared/types";
import { Badge } from "@/components/ui/badge";
import { formatInTimezone, getDayInTimezone } from "@/lib/utils/timezone";

interface EventCardProps {
  event: Event;
  timezone: string;
  onClick: (event: Event) => void;
  showDate?: boolean;
}

export const EVENT_TYPE_CONFIG = {
  travel: {
    color: "text-event-travel",
    accent: "border-l-event-travel",
    bg: "bg-event-travel-light",
  },
  meal: {
    color: "text-event-meal",
    accent: "border-l-event-meal",
    bg: "bg-event-meal-light",
  },
  activity: {
    color: "text-event-activity",
    accent: "border-l-event-activity",
    bg: "bg-event-activity-light",
  },
} as const;

export const EventCard = memo(function EventCard({
  event,
  timezone,
  onClick,
  showDate,
}: EventCardProps) {
  const config = EVENT_TYPE_CONFIG[event.eventType];

  // Format time
  const startTime = event.allDay
    ? "All day"
    : formatInTimezone(event.startTime, timezone, "time");
  const endTime = event.endTime
    ? formatInTimezone(event.endTime, timezone, "time")
    : null;
  const timeDisplay = event.allDay
    ? "All day"
    : endTime
      ? `${startTime} - ${endTime}`
      : startTime;
  const datePrefix = showDate
    ? formatInTimezone(event.startTime, timezone, "date")
    : null;
  const isMultiDay = event.endTime
    ? getDayInTimezone(event.startTime, timezone) !==
      getDayInTimezone(event.endTime, timezone)
    : false;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`rounded-md border border-border/60 border-l-4 ${config.accent} ${config.bg} py-2 px-3 transition-all hover:shadow-lg motion-safe:hover:-translate-y-1 motion-safe:active:scale-[0.98] cursor-pointer`}
      onClick={() => onClick(event)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(event);
        }
      }}
    >
      {/* Line 1: Time */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>
          {datePrefix ? `${datePrefix} · ` : ""}
          {timeDisplay}
        </span>
        {isMultiDay && (
          <Badge variant="outline" className="text-xs">
            {formatInTimezone(event.startTime, timezone, "short-date")}
            {"\u2013"}
            {formatInTimezone(event.endTime!, timezone, "short-date")}
          </Badge>
        )}
      </div>

      {/* Line 2: Name + Optional badge */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-semibold text-foreground text-sm truncate">
          {event.name}
        </span>
        {event.isOptional && (
          <Badge
            variant="outline"
            className="text-xs bg-background/50 border-border shrink-0"
          >
            Optional
          </Badge>
        )}
      </div>

      {/* Line 3: Location */}
      {event.location && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{event.location}</span>
        </div>
      )}
    </div>
  );
});
