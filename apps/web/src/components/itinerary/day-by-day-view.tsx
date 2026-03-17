"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Event,
  Accommodation,
  MemberTravel,
  DailyForecast,
  TemperatureUnit,
} from "@tripful/shared/types";
import { WeatherDayBadge } from "./weather-day-badge";
import { DayContent } from "./day-content";
import { useDayData } from "./use-day-data";
import { EventDetailSheet } from "./event-detail-sheet";
import { AccommodationDetailSheet } from "./accommodation-detail-sheet";
import { MemberTravelDetailSheet } from "./member-travel-detail-sheet";
import { EditEventDialog } from "./edit-event-dialog";
import { EditAccommodationDialog } from "./edit-accommodation-dialog";
import { EditMemberTravelDialog } from "./edit-member-travel-dialog";
import {
  getDayInTimezone,
  getDayNumber,
  getMonthAbbrev,
  getWeekdayAbbrev,
} from "@/lib/utils/timezone";
import { cn } from "@/lib/utils";
import { CalendarOff } from "lucide-react";
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
  forecasts?: DailyForecast[];
  temperatureUnit?: TemperatureUnit;
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
  forecasts,
  temperatureUnit,
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

  // Build forecast lookup by date
  const forecastMap = useMemo(() => {
    const map = new Map<string, DailyForecast>();
    if (forecasts) {
      for (const f of forecasts) {
        map.set(f.date, f);
      }
    }
    return map;
  }, [forecasts]);

  // Group data by day (shared hook)
  const dayData = useDayData({
    events,
    accommodations,
    memberTravels,
    timezone,
    tripStartDate,
    tripEndDate,
  });

  // Detail sheet state
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedAccommodation, setSelectedAccommodation] =
    useState<Accommodation | null>(null);
  const [selectedMemberTravel, setSelectedMemberTravel] =
    useState<MemberTravel | null>(null);

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

        return (
          <div
            key={day.date}
            id={isToday ? "day-today" : undefined}
            className={cn(
              "grid grid-cols-[3.5rem_1fr] sm:grid-cols-[4.5rem_1fr] gap-x-2 sm:gap-x-3 py-4",
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
                    "flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full text-xl sm:text-2xl font-bold leading-none",
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
                <WeatherDayBadge
                  forecast={forecastMap.get(day.date)}
                  temperatureUnit={temperatureUnit || "fahrenheit"}
                />
              </div>
            </div>

            {/* Content column */}
            <div
              className={cn(
                "min-w-0",
                !hasContent && !isToday && "flex items-center",
              )}
            >
              {hasContent || isToday ? (
                <DayContent
                  day={day}
                  isToday={isToday}
                  now={now}
                  timezone={timezone}
                  onEventClick={setSelectedEvent}
                  onAccommodationClick={setSelectedAccommodation}
                  onMemberTravelClick={setSelectedMemberTravel}
                />
              ) : (
                <div className="flex items-center gap-2 min-h-[4.5rem] pl-5 text-muted-foreground">
                  <CalendarOff className="size-5 shrink-0" />
                  <span className="text-sm">No events scheduled</span>
                </div>
              )}
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
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
        timezone={timezone}
        canEdit={
          selectedEvent
            ? canModifyEvent(selectedEvent, userId, isOrganizer, isLocked)
            : false
        }
        canDelete={
          selectedEvent
            ? canModifyEvent(selectedEvent, userId, isOrganizer, isLocked)
            : false
        }
        onEdit={(event) => {
          setSelectedEvent(null);
          setEditingEvent(event);
        }}
        createdByName={
          selectedEvent ? userNameMap.get(selectedEvent.createdBy) : undefined
        }
      />

      <AccommodationDetailSheet
        accommodation={selectedAccommodation}
        open={!!selectedAccommodation}
        onOpenChange={(open) => {
          if (!open) setSelectedAccommodation(null);
        }}
        timezone={timezone}
        canEdit={
          selectedAccommodation
            ? canModifyAccommodation(
                selectedAccommodation,
                userId,
                isOrganizer,
                isLocked,
              )
            : false
        }
        canDelete={
          selectedAccommodation
            ? canModifyAccommodation(
                selectedAccommodation,
                userId,
                isOrganizer,
                isLocked,
              )
            : false
        }
        onEdit={(acc) => {
          setSelectedAccommodation(null);
          setEditingAccommodation(acc);
        }}
        onDelete={() => setSelectedAccommodation(null)}
        createdByName={
          selectedAccommodation
            ? userNameMap.get(selectedAccommodation.createdBy)
            : undefined
        }
      />

      <MemberTravelDetailSheet
        memberTravel={selectedMemberTravel}
        open={!!selectedMemberTravel}
        onOpenChange={(open) => {
          if (!open) setSelectedMemberTravel(null);
        }}
        timezone={timezone}
        memberName={selectedMemberTravel?.memberName || "Unknown member"}
        canEdit={
          selectedMemberTravel
            ? canModifyMemberTravel(
                selectedMemberTravel,
                userId,
                isOrganizer,
                isLocked,
              )
            : false
        }
        canDelete={
          selectedMemberTravel
            ? canModifyMemberTravel(
                selectedMemberTravel,
                userId,
                isOrganizer,
                isLocked,
              )
            : false
        }
        onEdit={(travel) => {
          setSelectedMemberTravel(null);
          setEditingMemberTravel(travel);
        }}
        onDelete={() => setSelectedMemberTravel(null)}
      />
    </div>
  );
}
