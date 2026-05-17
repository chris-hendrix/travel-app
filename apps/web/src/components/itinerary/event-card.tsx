"use client";

import { memo } from "react";
import { Calendar, Car, Utensils, Palette, TreePine, Sparkles } from "lucide-react";
import type { Event } from "@journiful/shared/types";
import { formatInTimezone } from "@/lib/utils/timezone";

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
  food_and_drink: {
    color: "text-event-food_and_drink",
    accent: "border-l-event-food_and_drink",
    bg: "bg-event-food_and_drink-light",
    icon: Utensils,
  },
  arts_and_entertainment: {
    color: "text-event-arts_and_entertainment",
    accent: "border-l-event-arts_and_entertainment",
    bg: "bg-event-arts_and_entertainment-light",
    icon: Palette,
  },
  outdoors: {
    color: "text-event-outdoors",
    accent: "border-l-event-outdoors",
    bg: "bg-event-outdoors-light",
    icon: TreePine,
  },
  nightlife: {
    color: "text-event-nightlife",
    accent: "border-l-event-nightlife",
    bg: "bg-event-nightlife-light",
    icon: Sparkles,
  },
  misc: {
    color: "text-event-misc",
    accent: "border-l-event-misc",
    bg: "bg-event-misc-light",
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
  const Icon = config.icon;

  const timeDisplay = event.allDay
    ? "All day"
    : formatInTimezone(event.startTime, timezone, "time");
  const datePrefix = showDate
    ? formatInTimezone(event.startTime, timezone, "date")
    : null;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`flex items-center gap-2.5 rounded-md border-l-3 ${config.accent} ${config.bg} py-1.5 px-3 hover:brightness-95 active:brightness-90 transition-all cursor-pointer min-h-[36px]`}
      onClick={() => onClick(event)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(event);
        }
      }}
    >
      <Icon className={`w-4 h-4 shrink-0 ${config.color}`} />
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {datePrefix ? `${datePrefix} · ` : ""}
        {timeDisplay}
      </span>
      <span className="text-sm font-medium text-foreground truncate">
        {event.name}
      </span>
    </div>
  );
});
