"use client";

import { memo, useState } from "react";
import {
  MapPin,
  ExternalLink,
  Users,
  ChevronRight,
  ChevronDown,
  Pencil,
} from "lucide-react";
import type { Event } from "@tripful/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatInTimezone, getDayInTimezone } from "@/lib/utils/timezone";

interface EventCardProps {
  event: Event;
  timezone: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit?: (event: Event) => void;
  onDelete?: (event: Event) => void;
  createdByName?: string | undefined;
  showDate?: boolean;
}

const EVENT_TYPE_CONFIG = {
  travel: {
    color: "text-[var(--color-event-travel)]",
    accent: "border-l-[var(--color-event-travel)]",
    bg: "bg-[var(--color-event-travel-light)]",
  },
  meal: {
    color: "text-[var(--color-event-meal)]",
    accent: "border-l-[var(--color-event-meal)]",
    bg: "bg-[var(--color-event-meal-light)]",
  },
  activity: {
    color: "text-[var(--color-event-activity)]",
    accent: "border-l-[var(--color-event-activity)]",
    bg: "bg-[var(--color-event-activity-light)]",
  },
} as const;

export const EventCard = memo(function EventCard({
  event,
  timezone,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  createdByName,
  showDate,
}: EventCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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
      aria-expanded={isExpanded}
      className={`rounded-md border border-border/60 border-l-4 ${config.accent} ${config.bg} py-2 px-3 transition-all hover:shadow-lg motion-safe:hover:-translate-y-1 motion-safe:active:scale-[0.98] cursor-pointer`}
      onClick={() => setIsExpanded((prev) => !prev)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsExpanded((prev) => !prev);
        }
      }}
    >
      {/* Compact view */}
      <div className="flex items-center gap-2">
        <div className={`shrink-0 ${config.color}`}>
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Time row */}
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

          {/* Title + location row */}
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="font-semibold text-foreground text-sm truncate">
              {event.name}
            </span>
            {event.location && !isExpanded && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary active:text-primary shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MapPin className="w-3 h-3 shrink-0" />
                <span>
                  {event.location.length > 20
                    ? event.location.slice(0, 20) + "…"
                    : event.location}
                </span>
              </a>
            )}
            {event.creatorAttending === false && (
              <Badge
                variant="outline"
                className="text-xs bg-warning/15 text-warning border-warning/30"
              >
                Member no longer attending
              </Badge>
            )}
            {event.isOptional && (
              <Badge
                variant="outline"
                className="text-xs bg-background/50 border-border"
              >
                Optional
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Expanded view */}
      {isExpanded && (
        <div
          className="mt-2 pt-2 border-t border-border/40 space-y-2 ml-6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Full location */}
          {event.location && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground active:text-primary hover:text-primary py-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>{event.location}</span>
            </a>
          )}

          {event.description && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {event.description}
            </p>
          )}

          {(event.meetupLocation || event.meetupTime) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span>
                Meet{event.meetupLocation ? ` at ${event.meetupLocation}` : ""}
                {event.meetupTime
                  ? ` at ${formatInTimezone(event.meetupTime, timezone, "time")}`
                  : ""}
              </span>
            </div>
          )}

          {event.links && event.links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {event.links.map((link, index) => (
                <a
                  key={index}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3" />
                  Link {index + 1}
                </a>
              ))}
            </div>
          )}

          <div
            className={`text-xs text-muted-foreground ${event.creatorAttending === false ? "opacity-50 line-through" : ""}`}
          >
            Created by {createdByName || "Unknown"}
          </div>

          {(canEdit || canDelete) && (
            <div className="flex items-center gap-2 pt-1">
              {canEdit && onEdit && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(event);
                  }}
                  className="text-xs gap-1"
                  title="Edit event"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </Button>
              )}
              {canDelete && onDelete && (
                <Button
                  size="xs"
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(event);
                  }}
                  className="text-xs gap-1"
                  title="Delete event"
                >
                  Delete
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
