"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { Event, Accommodation, MemberTravel } from "@tripful/shared/types";
import { EventCard } from "./event-card";
import { AccommodationLineItem } from "./accommodation-line-item";
import { MemberTravelLineItem } from "./member-travel-line-item";
import { EventDetailSheet } from "./event-detail-sheet";
import { AccommodationDetailSheet } from "./accommodation-detail-sheet";
import { MemberTravelDetailSheet } from "./member-travel-detail-sheet";
import { EditEventDialog } from "./edit-event-dialog";
import { EditAccommodationDialog } from "./edit-accommodation-dialog";
import { EditMemberTravelDialog } from "./edit-member-travel-dialog";
import {
  getDayInTimezone,
  getDayLabel,
  getDayNumber,
  getMonthAbbrev,
  getWeekdayAbbrev,
  utcToLocalParts,
} from "@/lib/utils/timezone";
import { cn } from "@/lib/utils";
import { CalendarOff } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  canModifyEvent,
  canModifyAccommodation,
  canModifyMemberTravel,
} from "./utils/permissions";

interface DayByDayViewProps {
  events: Event[];
  accommodations: Accommodation[];
  memberTravels: MemberTravel[];
  timezone: string;
  tripStartDate: string | null;
  tripEndDate: string | null;
  isOrganizer: boolean;
  userId: string;
  userNameMap: Map<string, string>;
  isLocked?: boolean;
}

interface DayData {
  date: string;
  label: string;
  events: Event[];
  accommodations: Accommodation[];
  arrivals: MemberTravel[];
  departures: MemberTravel[];
}

function NowIndicator() {
  return (
    <div className="relative flex items-center py-0.5" aria-hidden="true">
      <div className="absolute left-0 h-2.5 w-2.5 rounded-full bg-primary" />
      <div className="ml-2 w-full border-t-2 border-primary" />
    </div>
  );
}

export function DayByDayView({
  events,
  accommodations,
  memberTravels,
  timezone,
  tripStartDate,
  tripEndDate,
  isOrganizer,
  userId,
  userNameMap,
  isLocked,
}: DayByDayViewProps) {
  // Track current time for the "now" indicator
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const todayString = useMemo(
    () => getDayInTimezone(new Date(now), timezone),
    [now, timezone],
  );

  // Group data by day
  const dayData = useMemo(() => {
    const days = new Map<string, DayData>();

    const ensureDay = (dateString: string) => {
      if (!days.has(dateString)) {
        days.set(dateString, {
          date: dateString,
          label: getDayLabel(dateString, timezone),
          events: [],
          accommodations: [],
          arrivals: [],
          departures: [],
        });
      }
    };

    // Add events to days (multi-day events appear on all spanned days)
    events.forEach((event) => {
      const startDay = getDayInTimezone(event.startTime, timezone);

      // Midnight end times don't count as a separate day (e.g. 8 PM–12 AM is single-day)
      const endIsMidnight = event.endTime
        ? utcToLocalParts(
            typeof event.endTime === "string" ? event.endTime : event.endTime.toISOString(),
            timezone,
          ).time === "00:00"
        : false;
      const endDay =
        event.endTime && !endIsMidnight
          ? getDayInTimezone(event.endTime, timezone)
          : startDay;

      if (startDay === endDay || !event.endTime) {
        // Single-day event
        ensureDay(startDay);
        days.get(startDay)!.events.push(event);
      } else {
        // Multi-day event: add to every day from start through end
        const current = new Date(startDay + "T00:00:00");
        const end = new Date(endDay + "T00:00:00");
        while (current <= end) {
          const dateString = current.toISOString().split("T")[0] || "";
          if (dateString) {
            ensureDay(dateString);
            days.get(dateString)!.events.push(event);
          }
          current.setDate(current.getDate() + 1);
        }
      }
    });

    // Add accommodations to all spanned days (check-in through day before check-out)
    accommodations.forEach((acc) => {
      const startDay = getDayInTimezone(acc.checkIn, timezone);
      const endDay = getDayInTimezone(acc.checkOut, timezone);
      const current = new Date(startDay + "T00:00:00");
      const end = new Date(endDay + "T00:00:00");
      while (current < end) {
        const dateString = current.toISOString().split("T")[0] || "";
        if (dateString) {
          ensureDay(dateString);
          days.get(dateString)!.accommodations.push(acc);
        }
        current.setDate(current.getDate() + 1);
      }
    });

    // Add member travels to days
    memberTravels.forEach((travel) => {
      const day = getDayInTimezone(travel.time, timezone);
      ensureDay(day);
      if (travel.travelType === "arrival") {
        days.get(day)!.arrivals.push(travel);
      } else {
        days.get(day)!.departures.push(travel);
      }
    });

    // Compute the full date range: min(tripStart, earliest item) to max(tripEnd, latest item)
    const allDates = Array.from(days.keys());
    if (tripStartDate) allDates.push(tripStartDate);
    if (tripEndDate) allDates.push(tripEndDate);

    if (allDates.length > 0) {
      allDates.sort();
      const rangeStart = allDates[0]!;
      const rangeEnd = allDates[allDates.length - 1]!;

      const current = new Date(rangeStart + "T00:00:00");
      const end = new Date(rangeEnd + "T00:00:00");
      while (current <= end) {
        const dateString = current.toISOString().split("T")[0] || "";
        if (dateString) ensureDay(dateString);
        current.setDate(current.getDate() + 1);
      }
    }

    // Sort days
    const sortedDays = Array.from(days.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // Sort events within each day (all-day events first, then by time)
    sortedDays.forEach((day) => {
      day.events.sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return (
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
      });

      // Sort travels by time
      day.arrivals.sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
      );
      day.departures.sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
      );
    });

    return sortedDays;
  }, [
    events,
    accommodations,
    memberTravels,
    timezone,
    tripStartDate,
    tripEndDate,
  ]);

  // Detail sheet state
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedAccommodation, setSelectedAccommodation] = useState<Accommodation | null>(null);
  const [selectedMemberTravel, setSelectedMemberTravel] = useState<MemberTravel | null>(null);

  // Edit dialog state
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editingAccommodation, setEditingAccommodation] =
    useState<Accommodation | null>(null);
  const [editingMemberTravel, setEditingMemberTravel] =
    useState<MemberTravel | null>(null);

  return (
    <div className="divide-y divide-border">
      {dayData.map((day) => {
        const isToday = day.date === todayString;
        const hasContent =
          day.events.length > 0 ||
          day.accommodations.length > 0 ||
          day.arrivals.length > 0 ||
          day.departures.length > 0;

        // Build the ordered list of card elements for this day,
        // inserting the "now" line at the right position for today
        const cardElements: ReactNode[] = [];
        let nowInserted = false;

        const maybeInsertNow = (itemTime: string | Date) => {
          if (!isToday || nowInserted) return;
          const t =
            typeof itemTime === "string"
              ? new Date(itemTime).getTime()
              : itemTime.getTime();
          if (now < t) {
            cardElements.push(<NowIndicator key="now-line" />);
            nowInserted = true;
          }
        };

        // Accommodations (no specific time, show first)
        day.accommodations.forEach((acc) => {
          cardElements.push(
            <AccommodationLineItem
              key={`acc-${acc.id}-${day.date}`}
              accommodation={acc}
              onClick={setSelectedAccommodation}
            />,
          );
        });

        // All-day events first
        day.events
          .filter((e) => e.allDay)
          .forEach((event) => {
            cardElements.push(
              <EventCard
                key={event.id}
                event={event}
                timezone={timezone}
                onClick={setSelectedEvent}
              />,
            );
          });

        // Merge timed events, arrivals, and departures into one chronological list
        type TimedItem =
          | { kind: "event"; time: number; event: Event }
          | { kind: "travel"; time: number; travel: MemberTravel };

        const timedItems: TimedItem[] = [];

        day.events
          .filter((e) => !e.allDay)
          .forEach((event) => {
            timedItems.push({
              kind: "event",
              time: new Date(event.startTime).getTime(),
              event,
            });
          });

        [...day.arrivals, ...day.departures].forEach((travel) => {
          timedItems.push({
            kind: "travel",
            time: new Date(travel.time).getTime(),
            travel,
          });
        });

        timedItems.sort((a, b) => a.time - b.time);

        timedItems.forEach((item) => {
          if (item.kind === "event") {
            maybeInsertNow(item.event.startTime);
            cardElements.push(
              <EventCard
                key={item.event.id}
                event={item.event}
                timezone={timezone}
                onClick={setSelectedEvent}
              />,
            );
          } else {
            maybeInsertNow(item.travel.time);
            cardElements.push(
              <MemberTravelLineItem
                key={item.travel.id}
                memberTravel={item.travel}
                memberName={item.travel.memberName || "Unknown member"}
                timezone={timezone}
                onClick={setSelectedMemberTravel}
              />,
            );
          }
        });

        // If today and "now" hasn't been inserted yet (all events are in the past
        // or there are no events), put the indicator at the end
        if (isToday && !nowInserted) {
          cardElements.push(<NowIndicator key="now-line" />);
        }

        return (
          <div
            key={day.date}
            id={isToday ? "day-today" : undefined}
            className={cn(
              "grid grid-cols-[3.5rem_1fr] sm:grid-cols-[4rem_1fr] gap-x-3 py-4",
              isToday && "scroll-mt-28",
            )}
          >
            {/* Date gutter — outer cell stretches to row height so sticky works */}
            <div className="relative">
              <div className="sticky top-[7.75rem] z-10 flex flex-col items-center pt-3">
                <span
                  className={cn(
                    "text-xs font-medium uppercase",
                    isToday ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {getMonthAbbrev(day.date, timezone)}
                </span>
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full text-2xl font-bold leading-none",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground",
                  )}
                >
                  {getDayNumber(day.date)}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium uppercase",
                    isToday ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {getWeekdayAbbrev(day.date, timezone)}
                </span>
              </div>
            </div>

            {/* Content column */}
            <div className="min-w-0">
              <div className="space-y-2">
                {cardElements}
                {!hasContent && !isToday && (
                  <EmptyState
                    icon={CalendarOff}
                    title="No events scheduled"
                    variant="inline"
                    className="min-h-[4.5rem] pl-5 py-0 items-start justify-center"
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}

      {dayData.length === 0 && (
        <div className="bg-card rounded-md border border-border p-8 text-center">
          <p className="text-muted-foreground">
            No trip dates set. Set trip dates to see a day-by-day view.
          </p>
        </div>
      )}

      {/* Edit dialogs */}
      {editingEvent && (
        <EditEventDialog
          open={!!editingEvent}
          onOpenChange={(open) => {
            if (!open) setEditingEvent(null);
          }}
          event={editingEvent}
          timezone={timezone}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
        />
      )}
      {editingAccommodation && (
        <EditAccommodationDialog
          open={!!editingAccommodation}
          onOpenChange={(open) => {
            if (!open) setEditingAccommodation(null);
          }}
          accommodation={editingAccommodation}
          timezone={timezone}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
        />
      )}
      {editingMemberTravel && (
        <EditMemberTravelDialog
          open={!!editingMemberTravel}
          onOpenChange={(open) => {
            if (!open) setEditingMemberTravel(null);
          }}
          memberTravel={editingMemberTravel}
          timezone={timezone}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
        />
      )}

      {/* Detail sheets */}
      <EventDetailSheet
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => { if (!open) setSelectedEvent(null); }}
        timezone={timezone}
        canEdit={selectedEvent ? canModifyEvent(selectedEvent, userId, isOrganizer, isLocked) : false}
        canDelete={selectedEvent ? canModifyEvent(selectedEvent, userId, isOrganizer, isLocked) : false}
        onEdit={(event) => { setSelectedEvent(null); setEditingEvent(event); }}
        createdByName={selectedEvent ? userNameMap.get(selectedEvent.createdBy) : undefined}
      />

      <AccommodationDetailSheet
        accommodation={selectedAccommodation}
        open={!!selectedAccommodation}
        onOpenChange={(open) => { if (!open) setSelectedAccommodation(null); }}
        timezone={timezone}
        canEdit={selectedAccommodation ? canModifyAccommodation(selectedAccommodation, userId, isOrganizer, isLocked) : false}
        canDelete={selectedAccommodation ? canModifyAccommodation(selectedAccommodation, userId, isOrganizer, isLocked) : false}
        onEdit={(acc) => { setSelectedAccommodation(null); setEditingAccommodation(acc); }}
        onDelete={() => setSelectedAccommodation(null)}
        createdByName={selectedAccommodation ? userNameMap.get(selectedAccommodation.createdBy) : undefined}
      />

      <MemberTravelDetailSheet
        memberTravel={selectedMemberTravel}
        open={!!selectedMemberTravel}
        onOpenChange={(open) => { if (!open) setSelectedMemberTravel(null); }}
        timezone={timezone}
        memberName={selectedMemberTravel?.memberName || "Unknown member"}
        canEdit={selectedMemberTravel ? canModifyMemberTravel(selectedMemberTravel, userId, isOrganizer, isLocked) : false}
        canDelete={selectedMemberTravel ? canModifyMemberTravel(selectedMemberTravel, userId, isOrganizer, isLocked) : false}
        onEdit={(travel) => { setSelectedMemberTravel(null); setEditingMemberTravel(travel); }}
        onDelete={() => setSelectedMemberTravel(null)}
      />
    </div>
  );
}
