"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  Building2,
  CalendarPlus,
  Pencil,
  Settings,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { RsvpPills } from "@/components/trip/rsvp-pills";
import { WeatherForecastCard } from "@/components/itinerary/weather-forecast-card";
import { AccommodationDetailSheet } from "@/components/itinerary/accommodation-detail-sheet";
import { EditAccommodationDialog } from "@/components/itinerary/edit-accommodation-dialog";
import { CreateAccommodationDialog } from "@/components/itinerary/create-accommodation-dialog";
import { CreateEventDialog } from "@/components/itinerary/create-event-dialog";
import { canModifyAccommodation } from "@/components/itinerary/utils/permissions";
import { useAccommodations } from "@/hooks/use-accommodations";
import { useAuth } from "@/app/providers/auth-provider";
import { TodaySection } from "./today-section";
import { linkifyText } from "@/utils/linkify";
import { getUploadUrl } from "@/lib/api";
import { getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supportsHover } from "@/lib/supports-hover";
import { getDayInTimezone } from "@/lib/utils/timezone";
import { getWeatherInfo, toDisplayTemp } from "@/lib/weather-codes";
import type { TripDetailWithMeta } from "@/hooks/trip-queries";
import type { Accommodation } from "@journiful/shared/types";
import type { TripWeatherResponse, TemperatureUnit } from "@journiful/shared/types";
import { THEME_PRESETS } from "@journiful/shared/config";

const preloadInviteMembersDialog = () =>
  void import("@/components/trip/invite-members-dialog");

const preloadEditTripDialog = () =>
  void import("@/components/trip/edit-trip-dialog");

type TripPhase = "beforeTrip" | "duringTrip" | "afterTrip";

function getTripPhase(startDate: string | null, endDate: string | null, timezone: string): TripPhase {
  if (!startDate) return "beforeTrip";
  const now = getDayInTimezone(new Date(), timezone);
  const start = getDayInTimezone(startDate, timezone);
  if (now < start) return "beforeTrip";
  if (!endDate) return "duringTrip";
  const end = getDayInTimezone(endDate, timezone);
  if (now > end) return "afterTrip";
  return "duringTrip";
}

function formatDateRange(checkIn: string, checkOut: string, timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
  });
  return `${fmt.format(new Date(checkIn))} – ${fmt.format(new Date(checkOut))}`;
}


interface InfoPanelProps {
  trip: TripDetailWithMeta;
  tripId: string;
  isOrganizer: boolean;
  activeEventCount: number;
  weather: TripWeatherResponse | undefined;
  weatherLoading: boolean;
  temperatureUnit: TemperatureUnit;
  currentMember: { id: string; userId: string; isMuted: boolean | undefined } | undefined;
  onOpenInvite: () => void;
  onOpenEdit: () => void;
  onOpenSettings: () => void;
  onOpenMembers: () => void;
  onNavigateToItinerary: () => void;
  onScroll?: (scrollTop: number) => void;
  className?: string;
}

export function InfoPanel({
  trip,
  tripId,
  isOrganizer,
  weather,
  weatherLoading,
  temperatureUnit,
  onOpenInvite,
  onOpenEdit,
  onOpenSettings,
  onOpenMembers,
  onNavigateToItinerary,
  onScroll,
  className,
}: InfoPanelProps) {
  const preset = trip.themeId
    ? (THEME_PRESETS.find((p) => p.id === trip.themeId) ?? null)
    : null;

  const timezone = trip.preferredTimezone || "UTC";

  const phase = useMemo(
    () => getTripPhase(trip.startDate, trip.endDate, timezone),
    [trip.startDate, trip.endDate, timezone],
  );

  const { user } = useAuth();
  const { data: accommodations } = useAccommodations(tripId);
  const [selectedAccommodation, setSelectedAccommodation] = useState<Accommodation | null>(null);
  const [editingAccommodation, setEditingAccommodation] = useState<Accommodation | null>(null);
  const [isCreateAccommodationOpen, setIsCreateAccommodationOpen] = useState(false);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);

  // Trip is locked one day after end date
  const isLocked = useMemo(() => {
    if (!trip.endDate) return false;
    const end = new Date(trip.endDate);
    end.setDate(end.getDate() + 1);
    return new Date() > end;
  }, [trip.endDate]);

  // Summary line: "+N going · Organized by X, Y"
  const goingCount = trip.memberCount;
  const organizerNames = trip.organizers.map((o) => o.displayName).join(", ");

  // Today's forecast for inline label
  const todayString = useMemo(
    () => getDayInTimezone(new Date(), timezone),
    [timezone],
  );
  const todayForecast = useMemo(() => {
    if (!weather?.forecasts) return undefined;
    return weather.forecasts.find((f) => f.date === todayString);
  }, [weather, todayString]);

  const todayDateStr = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(new Date()),
    [timezone],
  );

  const todayLabelNode = useMemo(() => {
    const base = (
      <>
        Today{" "}
        <span className="font-normal text-muted-foreground">{todayDateStr}</span>
      </>
    );
    if (!todayForecast) return base;
    const { icon: WIcon } = getWeatherInfo(todayForecast.weatherCode);
    const temp = toDisplayTemp(todayForecast.temperatureMax, temperatureUnit);
    const unit = temperatureUnit === "fahrenheit" ? "F" : "C";
    return (
      <>
        {base}{" "}
        <span className="inline-flex items-center gap-1 font-normal text-muted-foreground">
          · <WIcon className="size-3.5" /> {temp}°{unit}
        </span>
      </>
    );
  }, [todayDateStr, todayForecast, temperatureUnit]);

  return (
    <div
      className={cn("px-4 pt-8 pb-2 h-full overflow-y-auto", className)}
      onScroll={onScroll ? (e) => onScroll(e.currentTarget.scrollTop) : undefined}
    >
      <div className="mb-8 space-y-5">
        {/* 1. Action bar */}
        <div className="space-y-3">
          {/* RSVP pills — full width, equal sizing */}
          <div className="[&>div]:flex [&>div]:gap-2 [&>div>button]:flex-1">
            <RsvpPills tripId={trip.id} status={trip.userRsvpStatus} />
          </div>
          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-9"
              onClick={onNavigateToItinerary}
            >
              <CalendarPlus className="size-4" />
              Add Event
            </Button>
            {isOrganizer && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9"
                  onClick={onOpenInvite}
                  onMouseEnter={supportsHover ? preloadInviteMembersDialog : undefined}
                  onTouchStart={preloadInviteMembersDialog}
                  onFocus={preloadInviteMembersDialog}
                >
                  <UserPlus className="size-4" />
                  Invite
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={onOpenEdit}
                  onMouseEnter={supportsHover ? preloadEditTripDialog : undefined}
                  onTouchStart={preloadEditTripDialog}
                  onFocus={preloadEditTripDialog}
                  aria-label="Edit trip"
                >
                  <Pencil className="size-4" />
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={onOpenSettings}
              aria-label="Settings"
            >
              <Settings className="size-4" />
            </Button>
          </div>
        </div>

        {/* 2. Summary: Avatar stack + "+N going · Organized by X, Y" */}
        <button
          onClick={onOpenMembers}
          className="flex items-center gap-3 w-full text-left cursor-pointer"
        >
          <div className="flex -space-x-2 shrink-0">
            {trip.organizers.slice(0, 4).map((org) =>
              org.profilePhotoUrl ? (
                <Image
                  key={org.id}
                  src={getUploadUrl(org.profilePhotoUrl)!}
                  alt={org.displayName}
                  width={28}
                  height={28}
                  className="w-7 h-7 rounded-full ring-2 ring-background object-cover"
                />
              ) : (
                <div
                  key={org.id}
                  className="w-7 h-7 rounded-full ring-2 ring-background bg-muted flex items-center justify-center text-xs font-medium text-foreground"
                >
                  {getInitials(org.displayName)}
                </div>
              ),
            )}
          </div>
          <span className="text-sm text-muted-foreground truncate">
            {goingCount} going{organizerNames ? ` · Organized by ${organizerNames}` : ""}
          </span>
        </button>

        {/* 3. Accommodations */}
        {((accommodations && accommodations.length > 0) || (isOrganizer && !isLocked)) && (
          <CollapsibleSection label="Accommodations" defaultOpen>
            {accommodations && accommodations.length > 0 ? (
              <div className="space-y-2">
                {accommodations.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => setSelectedAccommodation(acc)}
                    className="w-full text-left bg-card linen-texture border border-border rounded-md p-3 hover:bg-accent/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">{acc.name}</span>
                    </div>
                    <div className="text-sm text-muted-foreground truncate mt-0.5 pl-6">
                      {formatDateRange(acc.checkIn, acc.checkOut, timezone)}
                      {acc.address ? ` · ${acc.address}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setIsCreateAccommodationOpen(true)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                + Add accommodation
              </button>
            )}
          </CollapsibleSection>
        )}

        {/* 4. Today section (only during trip) */}
        {phase === "duringTrip" && (
          <CollapsibleSection label={todayLabelNode} defaultOpen>
            <TodaySection
              tripId={tripId}
              timezone={timezone}
              isOrganizer={isOrganizer}
              isLocked={isLocked}
              tripStartDate={trip.startDate}
              tripEndDate={trip.endDate}
              {...(isOrganizer || trip.allowMembersToAddEvents
                ? { onAddEvent: () => setIsCreateEventOpen(true) }
                : {})}
            />
          </CollapsibleSection>
        )}

        {/* 5. About this trip */}
        {trip.description && (
          <CollapsibleSection label="About this trip" defaultOpen>
            <div className="bg-card rounded-md border border-border p-4 linen-texture">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {linkifyText(trip.description)}
              </p>
            </div>
          </CollapsibleSection>
        )}

        {/* 6. Weather */}
        <CollapsibleSection label="Weather" defaultOpen>
          <WeatherForecastCard
            weather={weather}
            isLoading={weatherLoading}
            temperatureUnit={temperatureUnit}
            isDark={preset?.background.isDark ?? false}
          />
        </CollapsibleSection>
      </div>

      {/* Accommodation detail sheet */}
      <AccommodationDetailSheet
        accommodation={selectedAccommodation}
        open={!!selectedAccommodation}
        onOpenChange={(open) => {
          if (!open) setSelectedAccommodation(null);
        }}
        timezone={timezone}
        canEdit={
          selectedAccommodation
            ? canModifyAccommodation(selectedAccommodation, user?.id ?? "", isOrganizer, isLocked)
            : false
        }
        canDelete={
          selectedAccommodation
            ? canModifyAccommodation(selectedAccommodation, user?.id ?? "", isOrganizer, isLocked)
            : false
        }
        onEdit={(acc) => {
          setSelectedAccommodation(null);
          setEditingAccommodation(acc);
        }}
        onDelete={() => setSelectedAccommodation(null)}
      />

      {/* Edit accommodation dialog */}
      {editingAccommodation && (
        <EditAccommodationDialog
          open={!!editingAccommodation}
          onOpenChange={(open) => {
            if (!open) setEditingAccommodation(null);
          }}
          accommodation={editingAccommodation}
          timezone={timezone}
        />
      )}

      {/* Create accommodation dialog */}
      <CreateAccommodationDialog
        open={isCreateAccommodationOpen}
        onOpenChange={setIsCreateAccommodationOpen}
        tripId={tripId}
        timezone={timezone}
        tripStartDate={trip.startDate}
        tripEndDate={trip.endDate}
      />

      {/* Create event dialog */}
      <CreateEventDialog
        open={isCreateEventOpen}
        onOpenChange={setIsCreateEventOpen}
        tripId={tripId}
        timezone={timezone}
        tripStartDate={trip.startDate}
        tripEndDate={trip.endDate}
      />
    </div>
  );
}
