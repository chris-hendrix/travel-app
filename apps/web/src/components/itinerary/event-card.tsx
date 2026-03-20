"use client";

import { memo } from "react";
import { Calendar, Car, MapPin, Utensils } from "lucide-react";
import type { Event } from "@journiful/shared/types";
import { Badge } from "@/components/ui/badge";
import {
  formatInTimezone,
  getDayInTimezone,
  utcToLocalParts,
} from "@/lib/utils/timezone";

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
    icon: Car,
  },
  meal: {
    color: "text-event-meal",
    accent: "border-l-event-meal",
    bg: "bg-event-meal-light",
    icon: Utensils,
  },
  activity: {
    color: "text-event-activity",
    accent: "border-l-event-activity",
    bg: "bg-event-activity-light",
    icon: Calendar,
  },
} as const;

export const EventCard = memo(function EventCard({
  event,
  timezone,
  onClick,
  showDate,
}: EventCardProps) {
  const config = EVENT_TYPE_CONFIG[event.eventType];

  // Midnight end times don't count as a separate day (e.g. 8 PM–12 AM is single-day)
  const endIsMidnight = event.endTime
    ? utcToLocalParts(
        typeof event.endTime === "string"
          ? event.endTime
          : event.endTime.toISOString(),
        timezone,
      ).time === "00:00"
    : false;

  const isMultiDay = event.endTime
    ? !endIsMidnight &&
      getDayInTimezone(event.startTime, timezone) !==
        getDayInTimezone(event.endTime, timezone)
    : false;

  let timeDisplay: string;
  if (event.allDay) {
    timeDisplay = "All day";
  } else if (isMultiDay) {
    const startPart = `${formatInTimezone(event.startTime, timezone, "short-date")}, ${formatInTimezone(event.startTime, timezone, "time")}`;
    const endPart = event.endTime
      ? `${formatInTimezone(event.endTime, timezone, "short-date")}, ${formatInTimezone(event.endTime, timezone, "time")}`
      : null;

    timeDisplay = endPart ? `${startPart} - ${endPart}` : startPart;
  } else {
    const startTime = formatInTimezone(event.startTime, timezone, "time");
    const endTime = event.endTime
      ? formatInTimezone(event.endTime, timezone, "time")
      : null;
    timeDisplay = endTime ? `${startTime} - ${endTime}` : startTime;
  }
  const datePrefix = showDate
    ? formatInTimezone(event.startTime, timezone, "date")
    : null;

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
      </div>

      {/* Line 2: Name + Optional badge + Member warning */}
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

      {/* Line 3: Location as map link */}
      {event.location && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors truncate"
          onClick={(e) => e.stopPropagation()}
          aria-label={`${event.location} on Google Maps`}
        >
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{event.location}</span>
        </a>
      )}
    </div>
  );
});
