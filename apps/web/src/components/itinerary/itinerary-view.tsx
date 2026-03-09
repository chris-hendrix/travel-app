"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CalendarX, Lock, Trash2 } from "lucide-react";
import { useAuth } from "@/app/providers/auth-provider";
import { useEvents, useEventsWithDeleted } from "@/hooks/use-events";
import {
  useAccommodations,
  useAccommodationsWithDeleted,
} from "@/hooks/use-accommodations";
import {
  useMemberTravels,
  useMemberTravelsWithDeleted,
} from "@/hooks/use-member-travel";
import { membersQueryOptions } from "@/hooks/invitation-queries";
import { useQuery } from "@tanstack/react-query";
import { useTripDetail } from "@/hooks/use-trips";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ItineraryHeader } from "./itinerary-header";
import { DayByDayView } from "./day-by-day-view";
import { GroupByTypeView } from "./group-by-type-view";
import { CreateEventDialog } from "./create-event-dialog";
import { CreateAccommodationDialog } from "./create-accommodation-dialog";
import { DeletedItemsDialog } from "./deleted-items-dialog";
import { TravelReminderBanner } from "@/components/trip/travel-reminder-banner";
import { EmptyState } from "@/components/ui/empty-state";
import type { DailyForecast, TemperatureUnit } from "@tripful/shared/types";

interface ItineraryViewProps {
  tripId: string;
  onAddTravel?: () => void;
  forecasts?: DailyForecast[] | undefined;
  temperatureUnit?: TemperatureUnit | undefined;
}

export function ItineraryView({ tripId, onAddTravel, forecasts, temperatureUnit }: ItineraryViewProps) {
  const { user } = useAuth();

  // Fetch data
  const {
    data: trip,
    isPending: tripPending,
    isError: tripError,
    refetch: refetchTrip,
  } = useTripDetail(tripId);
  const {
    data: events = [],
    isPending: eventsPending,
    isError: eventsError,
    refetch: refetchEvents,
  } = useEvents(tripId);
  const {
    data: accommodations = [],
    isPending: accommodationsPending,
    isError: accommodationsError,
    refetch: refetchAccommodations,
  } = useAccommodations(tripId);
  const {
    data: memberTravels = [],
    isPending: memberTravelsPending,
    isError: memberTravelsError,
    refetch: refetchMemberTravels,
  } = useMemberTravels(tripId);
  const { data: members = [] } = useQuery({
    ...membersQueryOptions(tripId),
    enabled: !!tripId,
    select: (data) =>
      data.map((m) => ({
        id: m.id,
        userId: m.userId,
        displayName: m.displayName,
      })),
  });

  // Fetch all items (including deleted) to check if deleted items exist
  const { data: allEvents = [] } = useEventsWithDeleted(tripId);
  const { data: allAccommodations = [] } = useAccommodationsWithDeleted(tripId);
  const { data: allMemberTravels = [] } = useMemberTravelsWithDeleted(tripId);
  const hasDeletedItems =
    allEvents.some((e) => e.deletedAt !== null) ||
    allAccommodations.some((a) => a.deletedAt !== null) ||
    allMemberTravels.some((t) => t.deletedAt !== null);

  // View state
  const [viewMode, setViewMode] = useState<"day-by-day" | "group-by-type">(
    "day-by-day",
  );
  const tripTimezone = trip?.preferredTimezone || "UTC";
  const userTimezone =
    user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [selectedTimezone, setSelectedTimezone] = useState(tripTimezone);

  // Dialog state
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [isCreateAccommodationOpen, setIsCreateAccommodationOpen] =
    useState(false);
  const [isDeletedItemsOpen, setIsDeletedItemsOpen] = useState(false);

  // Determine timezone
  const timezone = selectedTimezone;

  // Determine if user is an organizer or member
  const isOrganizer =
    user &&
    trip &&
    (trip.createdBy === user.id ||
      trip.organizers.some((org) => org.id === user.id));

  // For now, assume all authenticated users viewing the trip are members
  // In the future, this should check actual membership status from the API
  const isMember = !!user && !!trip;

  // Check if trip is locked (past end date)
  const isLocked = trip?.endDate
    ? new Date(`${trip.endDate}T23:59:59.999Z`) < new Date()
    : false;

  // Find current member for travel reminder banner
  const currentMember = members.find((m) => m.userId === user?.id);

  // Build userId→displayName lookup from organizers + members
  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (trip?.organizers) {
      for (const org of trip.organizers) {
        map.set(org.id, org.displayName);
      }
    }
    for (const member of members) {
      if (!map.has(member.userId)) {
        map.set(member.userId, member.displayName);
      }
    }
    return map;
  }, [trip?.organizers, members]);

  // Loading state
  const isLoading =
    tripPending ||
    eventsPending ||
    accommodationsPending ||
    memberTravelsPending;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="sticky top-0 z-10 bg-background border-b border-border p-4">
          <div className="max-w-5xl mx-auto">
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 space-y-6">
          <Skeleton className="h-20 w-full rounded-md" />
          <Skeleton className="h-20 w-full rounded-md" />
          <Skeleton className="h-20 w-full rounded-md" />
        </div>
      </div>
    );
  }

  // Error state
  const hasError =
    tripError || eventsError || accommodationsError || memberTravelsError;
  if (hasError) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-card rounded-md border border-destructive/30 p-8 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-foreground mb-2 font-playfair">
            Failed to load itinerary
          </h2>
          <p className="text-muted-foreground mb-6">
            There was an error loading the trip data. Please try again.
          </p>
          <Button
            variant="gradient"
            onClick={() => {
              refetchTrip();
              refetchEvents();
              refetchAccommodations();
              refetchMemberTravels();
            }}
            className="h-12 px-8 rounded-md"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Empty state
  const hasNoContent =
    events.length === 0 &&
    accommodations.length === 0 &&
    memberTravels.length === 0;

  if (hasNoContent) {
    return (
      <>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <EmptyState
            icon={CalendarX}
            title="No itinerary yet"
            description="Start planning your trip by adding events, accommodations, and travel details."
          >
            {isLocked && (
              <div className="bg-muted/50 border border-border rounded-md p-4 text-center text-sm text-muted-foreground">
                <Lock className="w-4 h-4 inline mr-2" />
                This trip has ended. The itinerary is read-only.
              </div>
            )}
            {isOrganizer && !isLocked && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="gradient"
                  className="h-12 px-8 rounded-md"
                  onClick={() => setIsCreateEventOpen(true)}
                >
                  Add Event
                </Button>
                <Button
                  variant="outline"
                  className="h-12 px-8 rounded-md"
                  onClick={() => setIsCreateAccommodationOpen(true)}
                >
                  Add Accommodation
                </Button>
              </div>
            )}
          </EmptyState>
          {isOrganizer && hasDeletedItems && (
            <Button
              variant="ghost"
              className="mt-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mx-auto"
              onClick={() => setIsDeletedItemsOpen(true)}
            >
              <Trash2 className="w-4 h-4" />
              View deleted items
            </Button>
          )}
        </div>

        {/* Dialogs for empty state */}
        <CreateEventDialog
          open={isCreateEventOpen}
          onOpenChange={setIsCreateEventOpen}
          tripId={tripId}
          timezone={timezone}
          tripStartDate={trip?.startDate || null}
          tripEndDate={trip?.endDate || null}
        />
        <CreateAccommodationDialog
          open={isCreateAccommodationOpen}
          onOpenChange={setIsCreateAccommodationOpen}
          tripId={tripId}
          timezone={timezone}
          tripStartDate={trip?.startDate || null}
          tripEndDate={trip?.endDate || null}
        />
        <DeletedItemsDialog
          open={isDeletedItemsOpen}
          onOpenChange={setIsDeletedItemsOpen}
          tripId={tripId}
          timezone={timezone}
        />
      </>
    );
  }

  return (
    <div>
      {/* Header with toggles */}
      <ItineraryHeader
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        selectedTimezone={selectedTimezone}
        onTimezoneChange={setSelectedTimezone}
        tripTimezone={tripTimezone}
        userTimezone={userTimezone}
        tripId={tripId}
        isOrganizer={!!isOrganizer}
        isMember={!!isMember}
        allowMembersToAddEvents={trip?.allowMembersToAddEvents || false}
        isLocked={isLocked}
        tripStartDate={trip?.startDate || null}
        tripEndDate={trip?.endDate || null}
      />

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 pt-4 pb-24">
        {onAddTravel &&
          !isLocked &&
          currentMember &&
          trip?.userRsvpStatus === "going" && (
            <TravelReminderBanner
              tripId={tripId}
              memberId={currentMember.id}
              onAddTravel={onAddTravel}
            />
          )}
        {isLocked && (
          <div className="bg-muted/50 border border-border rounded-md p-4 text-center text-sm text-muted-foreground mb-6">
            <Lock className="w-4 h-4 inline mr-2" />
            This trip has ended. The itinerary is read-only.
          </div>
        )}
        {viewMode === "day-by-day" ? (
          <DayByDayView
            events={events}
            accommodations={accommodations}
            memberTravels={memberTravels}
            timezone={timezone}
            tripStartDate={trip?.startDate || null}
            tripEndDate={trip?.endDate || null}
            isOrganizer={!!isOrganizer}
            userId={user?.id || ""}
            userNameMap={userNameMap}
            isLocked={isLocked}
            forecasts={forecasts ?? []}
            temperatureUnit={temperatureUnit ?? "celsius"}
          />
        ) : (
          <GroupByTypeView
            events={events}
            accommodations={accommodations}
            memberTravels={memberTravels}
            timezone={timezone}
            isOrganizer={!!isOrganizer}
            userId={user?.id || ""}
            userNameMap={userNameMap}
            isLocked={isLocked}
            tripStartDate={trip?.startDate || null}
            tripEndDate={trip?.endDate || null}
          />
        )}
        {isOrganizer && hasDeletedItems && (
          <Button
            variant="ghost"
            className="mt-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mx-auto"
            onClick={() => setIsDeletedItemsOpen(true)}
          >
            <Trash2 className="w-4 h-4" />
            View deleted items
          </Button>
        )}
      </div>

      <DeletedItemsDialog
        open={isDeletedItemsOpen}
        onOpenChange={setIsDeletedItemsOpen}
        tripId={tripId}
        timezone={timezone}
      />
    </div>
  );
}
