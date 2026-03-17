import { useMemo } from "react";
import type {
  Event,
  Accommodation,
  MemberTravel,
} from "@tripful/shared/types";
import type { DayData } from "./day-content";
import {
  getDayInTimezone,
  getDayLabel,
  utcToLocalParts,
} from "@/lib/utils/timezone";

interface UseDayDataOptions {
  events: Event[];
  accommodations: Accommodation[];
  memberTravels: MemberTravel[];
  timezone: string;
  tripStartDate: string | null;
  tripEndDate: string | null;
}

export function useDayData({
  events,
  accommodations,
  memberTravels,
  timezone,
  tripStartDate,
  tripEndDate,
}: UseDayDataOptions): DayData[] {
  return useMemo(() => {
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
  }, [events, accommodations, memberTravels, timezone, tripStartDate, tripEndDate]);
}
