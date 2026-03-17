"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parse, format } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarPlus } from "lucide-react";
import type {
  Event,
  Accommodation,
  MemberTravel,
  DailyForecast,
  TemperatureUnit,
} from "@tripful/shared/types";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WeatherDayBadge } from "./weather-day-badge";
import { DayContent } from "./day-content";
import { useDayData } from "./use-day-data";
import { EventDetailSheet } from "./event-detail-sheet";
import { AccommodationDetailSheet } from "./accommodation-detail-sheet";
import { MemberTravelDetailSheet } from "./member-travel-detail-sheet";
import { EditEventDialog } from "./edit-event-dialog";
import { EditAccommodationDialog } from "./edit-accommodation-dialog";
import { EditMemberTravelDialog } from "./edit-member-travel-dialog";
import { getDayInTimezone } from "@/lib/utils/timezone";
import {
  canModifyEvent,
  canModifyAccommodation,
  canModifyMemberTravel,
} from "./utils/permissions";

interface DayStepperViewProps {
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
  onCreateEvent?: () => void;
}

function getDefaultDayIndex(
  days: { date: string }[],
  tripStartDate: string | null,
  tripEndDate: string | null,
  timezone: string,
): number {
  if (days.length === 0) return 0;
  const today = getDayInTimezone(new Date(), timezone);

  // Find today in the day list
  const todayIdx = days.findIndex((d) => d.date === today);
  if (todayIdx !== -1) return todayIdx;

  // Before trip: first day
  if (tripStartDate && today < tripStartDate) return 0;

  // After trip: last day
  if (tripEndDate && today > tripEndDate) return days.length - 1;

  // Fallback: first day
  return 0;
}

export function DayStepperView({
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
  onCreateEvent,
}: DayStepperViewProps) {
  const dayData = useDayData({
    events,
    accommodations,
    memberTravels,
    timezone,
    tripStartDate,
    tripEndDate,
  });

  // Track current time for "now" indicator
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

  // Day index state
  const [currentDayIndex, setCurrentDayIndex] = useState(() =>
    getDefaultDayIndex(dayData, tripStartDate, tripEndDate, timezone),
  );

  // Clamp index when dayData changes
  useEffect(() => {
    if (dayData.length > 0 && currentDayIndex >= dayData.length) {
      setCurrentDayIndex(dayData.length - 1);
    }
  }, [dayData.length, currentDayIndex]);

  const currentDay = dayData[currentDayIndex];
  const hasPrev = currentDayIndex > 0;
  const hasNext = currentDayIndex < dayData.length - 1;

  const goToPrev = useCallback(() => {
    setCurrentDayIndex((i) => Math.max(0, i - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentDayIndex((i) => Math.min(dayData.length - 1, i + 1));
  }, [dayData.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goToPrev();
      else if (e.key === "ArrowRight") goToNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrev, goToNext]);

  // Touch/swipe handling
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swiping = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]!.clientX;
    touchStartY.current = e.touches[0]!.clientY;
    swiping.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0]!.clientX - touchStartX.current;
    const dy = e.touches[0]!.clientY - touchStartY.current;
    // If horizontal movement dominates, mark as swiping
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      swiping.current = true;
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const dx = e.changedTouches[0]!.clientX - touchStartX.current;
      if (swiping.current && Math.abs(dx) > 50) {
        if (dx > 0) goToPrev();
        else goToNext();
      }
      touchStartX.current = null;
      touchStartY.current = null;
      swiping.current = false;
    },
    [goToPrev, goToNext],
  );

  // Calendar popover state
  const [calendarOpen, setCalendarOpen] = useState(false);

  const handleCalendarSelect = useCallback(
    (date: Date | undefined) => {
      if (!date) return;
      const dateString = format(date, "yyyy-MM-dd");
      const idx = dayData.findIndex((d) => d.date === dateString);
      if (idx !== -1) {
        setCurrentDayIndex(idx);
        setCalendarOpen(false);
      }
    },
    [dayData],
  );

  // Trip date range for calendar
  const tripStartParsed = tripStartDate
    ? parse(tripStartDate, "yyyy-MM-dd", new Date())
    : undefined;
  const tripEndParsed = tripEndDate
    ? parse(tripEndDate, "yyyy-MM-dd", new Date())
    : undefined;

  // Only allow selecting trip days in the calendar
  const calendarDisabled = useMemo(() => {
    if (!tripStartParsed || !tripEndParsed) return undefined;
    return [
      { before: tripStartParsed },
      { after: tripEndParsed },
    ];
  }, [tripStartParsed, tripEndParsed]);

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

  if (dayData.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No trip dates set. Set trip dates to see the itinerary.
      </div>
    );
  }

  if (!currentDay) return null;

  const isToday = currentDay.date === todayString;
  const hasContent =
    currentDay.events.length > 0 ||
    currentDay.accommodations.length > 0 ||
    currentDay.arrivals.length > 0 ||
    currentDay.departures.length > 0;

  const dateLabel = format(
    parse(currentDay.date, "yyyy-MM-dd", new Date()),
    "EEE, MMM d",
  );

  const selectedCalendarDate = parse(
    currentDay.date,
    "yyyy-MM-dd",
    new Date(),
  );

  return (
    <>
      {/* Day navigation header */}
      <nav
        aria-label="Day navigation"
        className="flex items-center justify-between gap-2 py-2"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-12 w-12 shrink-0"
          onClick={goToPrev}
          disabled={!hasPrev}
          aria-label="Previous day"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <button
              className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors"
              aria-label="Pick a day"
            >
              <span className={isToday ? "text-primary" : ""}>
                {dateLabel}
              </span>
              <WeatherDayBadge
                forecast={forecastMap.get(currentDay.date)}
                temperatureUnit={temperatureUnit || "fahrenheit"}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            {/* @ts-expect-error — react-day-picker union types incompatible with exactOptionalPropertyTypes */}
            <Calendar
              mode="single"
              selected={selectedCalendarDate}
              onSelect={handleCalendarSelect}
              defaultMonth={selectedCalendarDate}
              disabled={calendarDisabled}
              tripRange={
                tripStartDate || tripEndDate
                  ? { start: tripStartDate, end: tripEndDate }
                  : undefined
              }
            />
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          className="h-12 w-12 shrink-0"
          onClick={goToNext}
          disabled={!hasNext}
          aria-label="Next day"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </nav>

      {/* Day content with swipe support */}
      <div
        className="min-h-[200px] pt-2"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {hasContent || isToday ? (
          <DayContent
            day={currentDay}
            isToday={isToday}
            now={now}
            timezone={timezone}
            onEventClick={setSelectedEvent}
            onAccommodationClick={setSelectedAccommodation}
            onMemberTravelClick={setSelectedMemberTravel}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
            <span className="text-sm">Nothing planned</span>
            {isOrganizer && !isLocked && onCreateEvent && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCreateEvent}
                className="gap-1.5"
              >
                <CalendarPlus className="h-4 w-4" />
                Add event
              </Button>
            )}
          </div>
        )}
      </div>

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
    </>
  );
}
