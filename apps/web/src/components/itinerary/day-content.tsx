"use client";

import { type ReactNode } from "react";
import type {
  Event,
  Accommodation,
  MemberTravel,
} from "@tripful/shared/types";
import { EventCard } from "./event-card";
import { AccommodationLineItem } from "./accommodation-line-item";
import { MemberTravelLineItem } from "./member-travel-line-item";

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

interface DayContentProps {
  day: DayData;
  isToday: boolean;
  now: number;
  timezone: string;
  onEventClick: (event: Event) => void;
  onAccommodationClick: (accommodation: Accommodation) => void;
  onMemberTravelClick: (memberTravel: MemberTravel) => void;
}

export type { DayData };

export function DayContent({
  day,
  isToday,
  now,
  timezone,
  onEventClick,
  onAccommodationClick,
  onMemberTravelClick,
}: DayContentProps) {
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
        onClick={onAccommodationClick}
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
          onClick={onEventClick}
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
          onClick={onEventClick}
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
          onClick={onMemberTravelClick}
        />,
      );
    }
  });

  // If today and "now" hasn't been inserted yet, put the indicator at the end
  if (isToday && !nowInserted) {
    cardElements.push(<NowIndicator key="now-line" />);
  }

  return <div className="space-y-2">{cardElements}</div>;
}
