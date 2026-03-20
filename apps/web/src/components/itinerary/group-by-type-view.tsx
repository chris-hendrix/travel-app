"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  Car,
  Utensils,
  Calendar,
  PlaneLanding,
  PlaneTakeoff,
} from "lucide-react";
import type { Event, Accommodation, MemberTravel } from "@journiful/shared/types";
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
  canModifyEvent,
  canModifyAccommodation,
  canModifyMemberTravel,
} from "./utils/permissions";
import { getDayInTimezone, getDayLabel } from "@/lib/utils/timezone";

interface GroupByTypeViewProps {
  events: Event[];
  accommodations: Accommodation[];
  memberTravels: MemberTravel[];
  timezone: string;
  isOrganizer: boolean;
  userId: string;
  userNameMap: Map<string, string>;
  isLocked?: boolean;
  tripStartDate?: string | null | undefined;
  tripEndDate?: string | null | undefined;
}

export function GroupByTypeView({
  events,
  accommodations,
  memberTravels,
  timezone,
  isOrganizer,
  userId,
  userNameMap,
  isLocked,
  tripStartDate,
  tripEndDate,
}: GroupByTypeViewProps) {
  // Group events by type
  const groupedEvents = useMemo(() => {
    const travel: Event[] = [];
    const meal: Event[] = [];
    const activity: Event[] = [];

    for (const event of events) {
      if (event.eventType === "travel") travel.push(event);
      else if (event.eventType === "meal") meal.push(event);
      else if (event.eventType === "activity") activity.push(event);
    }

    const sortByStartTime = (a: Event, b: Event) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime();

    const arrivals = memberTravels
      .filter((t) => t.travelType === "arrival")
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const departures = memberTravels
      .filter((t) => t.travelType === "departure")
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    return {
      accommodations: [...accommodations].sort(
        (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime(),
      ),
      arrivals,
      departures,
      travel: travel.sort(sortByStartTime),
      meal: meal.sort(sortByStartTime),
      activity: activity.sort(sortByStartTime),
    };
  }, [events, accommodations, memberTravels]);

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

  const sections = useMemo(
    () => [
      {
        title: "Accommodations",
        icon: Building2,
        iconClassName: "",
        color: "text-accommodation",
        bgColor: "bg-accommodation-light",
        items: groupedEvents.accommodations,
        type: "accommodation" as const,
      },
      {
        title: "Arrivals",
        icon: PlaneLanding,
        iconClassName: "",
        color: "text-member-travel",
        bgColor: "bg-member-travel-light",
        items: groupedEvents.arrivals,
        type: "memberTravel" as const,
      },
      {
        title: "Travel",
        icon: Car,
        iconClassName: "",
        color: "text-event-travel",
        bgColor: "bg-event-travel-light",
        items: groupedEvents.travel,
        type: "event" as const,
      },
      {
        title: "Meals",
        icon: Utensils,
        iconClassName: "",
        color: "text-event-meal",
        bgColor: "bg-event-meal-light",
        items: groupedEvents.meal,
        type: "event" as const,
      },
      {
        title: "Activities",
        icon: Calendar,
        iconClassName: "",
        color: "text-event-activity",
        bgColor: "bg-event-activity-light",
        items: groupedEvents.activity,
        type: "event" as const,
      },
      {
        title: "Departures",
        icon: PlaneTakeoff,
        iconClassName: "",
        color: "text-member-travel",
        bgColor: "bg-member-travel-light",
        items: groupedEvents.departures,
        type: "memberTravel" as const,
      },
    ],
    [groupedEvents],
  );

  return (
    <div className="divide-y divide-border">
      {sections.map((section, index) => {
        const Icon = section.icon;
        return (
          <div
            key={section.title}
            className="grid grid-cols-[3.5rem_1fr] sm:grid-cols-[4rem_1fr] gap-x-3 py-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 duration-500"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            {/* Icon gutter — outer cell stretches to row height so sticky works */}
            <div className="relative">
              <div className="sticky top-[7.75rem] z-10 flex flex-col items-center pt-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${bgFor(section)} ${section.color}`}
                  title={section.title}
                >
                  <Icon className={`w-5 h-5 ${section.iconClassName}`} />
                </div>
              </div>
            </div>

            {/* Content column */}
            <div className="min-w-0">
              {section.items.length > 0 ? (
                <div className="space-y-1">
                  {groupByDay(section.items, section.type, timezone).map(
                    ({ day, items: dayItems }) => (
                      <div key={day}>
                        <div className="px-2 pt-2 pb-1">
                          <span className="text-xs font-medium text-muted-foreground">
                            {getDayLabel(day, timezone)}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {section.type === "accommodation"
                            ? dayItems.map((item) => (
                                <AccommodationLineItem
                                  key={item.id}
                                  accommodation={item as Accommodation}
                                  onClick={setSelectedAccommodation}
                                />
                              ))
                            : section.type === "memberTravel"
                              ? dayItems.map((item) => {
                                  const travel = item as MemberTravel;
                                  return (
                                    <MemberTravelLineItem
                                      key={travel.id}
                                      memberTravel={travel}
                                      memberName={
                                        travel.memberName || "Unknown"
                                      }
                                      timezone={timezone}
                                      onClick={setSelectedMemberTravel}
                                    />
                                  );
                                })
                              : dayItems.map((item) => (
                                  <EventCard
                                    key={item.id}
                                    event={item as Event}
                                    timezone={timezone}
                                    onClick={setSelectedEvent}
                                  />
                                ))}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <div className="flex items-center min-h-10 pl-5">
                  <p className="text-xs text-muted-foreground/60">
                    No {section.title.toLowerCase()} added yet
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}

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

/** Pick the right background for the icon circle */
function bgFor(section: { bgColor: string }) {
  return section.bgColor;
}

/** Group items by day, returning sorted day groups */
function groupByDay(
  items: (Event | Accommodation | MemberTravel)[],
  type: "event" | "accommodation" | "memberTravel",
  timezone: string,
): { day: string; items: (Event | Accommodation | MemberTravel)[] }[] {
  const groups = new Map<string, (Event | Accommodation | MemberTravel)[]>();

  for (const item of items) {
    let day: string;
    if (type === "accommodation") {
      day = getDayInTimezone((item as Accommodation).checkIn, timezone);
    } else if (type === "memberTravel") {
      day = getDayInTimezone((item as MemberTravel).time, timezone);
    } else {
      day = getDayInTimezone((item as Event).startTime, timezone);
    }
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(item);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayItems]) => ({ day, items: dayItems }));
}
