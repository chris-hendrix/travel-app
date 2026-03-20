"use client";

import Image from "next/image";
import {
  Users,
  ClipboardList,
  UserPlus,
  Pencil,
  Settings,
} from "lucide-react";
import { RsvpBadgeDropdown } from "@/components/trip/rsvp-badge-dropdown";
import { WeatherForecastCard } from "@/components/itinerary/weather-forecast-card";
import { MessageCountIndicator } from "@/components/messaging";
import { TodaySection } from "./today-section";
import { linkifyText } from "@/utils/linkify";
import { getUploadUrl } from "@/lib/api";
import { getInitials } from "@/lib/format";
import { supportsHover } from "@/lib/supports-hover";
import type { TripDetailWithMeta } from "@/hooks/trip-queries";
import type { TripWeatherResponse, TemperatureUnit } from "@journiful/shared/types";
import { THEME_PRESETS } from "@journiful/shared/config";

const preloadInviteMembersDialog = () =>
  void import("@/components/trip/invite-members-dialog");

const preloadEditTripDialog = () =>
  void import("@/components/trip/edit-trip-dialog");

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
}

export function InfoPanel({
  trip,
  tripId,
  isOrganizer,
  activeEventCount,
  weather,
  weatherLoading,
  temperatureUnit,
  onOpenInvite,
  onOpenEdit,
  onOpenSettings,
  onOpenMembers,
  onNavigateToItinerary,
}: InfoPanelProps) {
  const preset = trip.themeId
    ? (THEME_PRESETS.find((p) => p.id === trip.themeId) ?? null)
    : null;

  return (
    <div className="px-4 pt-8 pb-2">
      <div className="mb-8">
        {/* RSVP + action icons */}
        <div className="flex items-center mb-6">
          <RsvpBadgeDropdown
            tripId={trip.id}
            status={trip.userRsvpStatus}
          />
          <span className="flex-1" aria-hidden="true" />
          <div className="flex items-center gap-3">
            {isOrganizer && (
              <>
                <button
                  onClick={onOpenInvite}
                  onMouseEnter={
                    supportsHover ? preloadInviteMembersDialog : undefined
                  }
                  onTouchStart={preloadInviteMembersDialog}
                  onFocus={preloadInviteMembersDialog}
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Invite members"
                >
                  <UserPlus className="w-5 h-5" />
                </button>
                <button
                  onClick={onOpenEdit}
                  onMouseEnter={
                    supportsHover ? preloadEditTripDialog : undefined
                  }
                  onTouchStart={preloadEditTripDialog}
                  onFocus={preloadEditTripDialog}
                  className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Edit trip"
                >
                  <Pencil className="w-5 h-5" />
                </button>
              </>
            )}
            <button
              onClick={onOpenSettings}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Organizers */}
        {trip.organizers.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Organizers
            </h3>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {trip.organizers.map((org) =>
                  org.profilePhotoUrl ? (
                    <Image
                      key={org.id}
                      src={getUploadUrl(org.profilePhotoUrl)!}
                      alt={org.displayName}
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-full ring-2 ring-white object-cover"
                    />
                  ) : (
                    <div
                      key={org.id}
                      className="w-8 h-8 rounded-full ring-2 ring-white bg-muted flex items-center justify-center text-xs font-medium text-foreground"
                    >
                      {getInitials(org.displayName)}
                    </div>
                  ),
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {trip.organizers.map((org) => org.displayName).join(", ")}
              </span>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-6">
          <button
            onClick={onOpenMembers}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <Users className="w-5 h-5" />
            <span className="text-sm">
              {trip.memberCount} member{trip.memberCount !== 1 ? "s" : ""}
            </span>
          </button>
          <button
            onClick={onNavigateToItinerary}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ClipboardList className="w-5 h-5" />
            <span className="text-sm">
              {activeEventCount === 0
                ? "No events yet"
                : `${activeEventCount} event${activeEventCount === 1 ? "" : "s"}`}
            </span>
          </button>
          <MessageCountIndicator tripId={tripId} />
        </div>

        {/* Today's schedule */}
        <TodaySection
          tripId={tripId}
          timezone={trip.preferredTimezone || "UTC"}
          onNavigateToItinerary={onNavigateToItinerary}
        />

        {/* About this trip */}
        <div className="mb-2 space-y-3">
          {trip.description && (
            <div className="bg-card rounded-md border border-border p-6 linen-texture">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {linkifyText(trip.description)}
              </p>
            </div>
          )}
          <WeatherForecastCard
            weather={weather}
            isLoading={weatherLoading}
            temperatureUnit={temperatureUnit}
            isDark={preset?.background.isDark ?? false}
          />
        </div>
      </div>
    </div>
  );
}
