"use client";

import { useMemo, useState } from "react";
import type { Event } from "@journiful/shared/types";
import { useEvents } from "@/hooks/use-events";
import { getDayInTimezone, formatInTimezone, utcToLocalParts } from "@/lib/utils/timezone";
import { EVENT_TYPE_CONFIG } from "@/components/itinerary/event-card";
import { EventDetailSheet } from "@/components/itinerary/event-detail-sheet";
import { Skeleton } from "@/components/ui/skeleton";

interface TodaySectionProps {
  tripId: string;
  timezone: string;
  onAddEvent?: () => void;
}

export function TodaySection({
  tripId,
  timezone,
  onAddEvent,
}: TodaySectionProps) {
  const { data: events, isPending: eventsLoading } = useEvents(tripId);

  const todayString = useMemo(
    () => getDayInTimezone(new Date(), timezone),
    [timezone],
  );

  // Filter events to today
  const todayEvents = useMemo(() => {
    if (!events) return [];
    return events.filter((event) => {
      const startDay = getDayInTimezone(event.startTime, timezone);

      if (event.allDay) {
        // All-day events: check if today is in range
        if (!event.endTime) return startDay === todayString;
        const endDay = getDayInTimezone(event.endTime, timezone);
        return startDay <= todayString && todayString <= endDay;
      }

      // Timed events: check if today falls within start-end range
      const endIsMidnight = event.endTime
        ? utcToLocalParts(
            typeof event.endTime === "string"
              ? event.endTime
              : event.endTime.toISOString(),
            timezone,
          ).time === "00:00"
        : false;
      const endDay =
        event.endTime && !endIsMidnight
          ? getDayInTimezone(event.endTime, timezone)
          : startDay;

      if (startDay === endDay) {
        return startDay === todayString;
      }
      // Multi-day event
      return startDay <= todayString && todayString <= endDay;
    });
  }, [events, timezone, todayString]);

  // Sort: all-day first, then by startTime
  const sortedEvents = useMemo(() => {
    return [...todayEvents].sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return (
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
    });
  }, [todayEvents]);


  // Detail sheet state
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const isLoading = eventsLoading;
  const isEmpty = !isLoading && sortedEvents.length === 0;

  // Show "add event" link if no events today
  if (!isLoading && isEmpty) {
    return onAddEvent ? (
      <button
        onClick={onAddEvent}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        + Add an event
      </button>
    ) : null;
  }

  return (
    <div>
      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
        </div>
      )}

      {!isLoading && !isEmpty && (
        <div className="bg-card linen-texture rounded-md border border-border divide-y divide-border">
          {sortedEvents.map((event) => {
            const config = EVENT_TYPE_CONFIG[event.eventType];
            const Icon = config.icon;
            const time = event.allDay
              ? "All day"
              : formatInTimezone(event.startTime, timezone, "time");
            return (
              <button
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className="flex items-center gap-2.5 w-full text-left py-2 px-3 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {time}
                </span>
                <span className="text-sm text-foreground truncate">
                  {event.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail sheet */}
      <EventDetailSheet
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
        timezone={timezone}
        canEdit={false}
        canDelete={false}
        onEdit={() => {}}
      />
    </div>
  );
}
