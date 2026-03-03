"use client";

import { memo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Users, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RsvpBadge } from "@/components/ui/rsvp-badge";
import { formatDateRange, getInitials } from "@/lib/format";
import { getUploadUrl } from "@/lib/api";
import { TripThemeProvider } from "@/components/trip/trip-theme-provider";
import { buildBackground } from "@/lib/theme-styles";
import { THEME_PRESETS } from "@tripful/shared/config";
import { usePrefetchTrip } from "@/hooks/use-trips";
import { supportsHover } from "@/lib/supports-hover";
import { cn } from "@/lib/utils";

const rotations = [-1.5, 0.8, -0.5, 1.2];

interface TripCardProps {
  trip: {
    id: string;
    name: string;
    destination: string;
    startDate: string | null;
    endDate: string | null;
    coverImageUrl: string | null;
    isOrganizer: boolean;
    rsvpStatus: "going" | "not_going" | "maybe" | "no_response";
    organizerInfo?: Array<{
      id: string;
      displayName: string;
      profilePhotoUrl: string | null;
    }>;
    memberCount: number;
    eventCount: number;
    themeId?: string | null;
    themeFont?: string | null;
  };
  index?: number;
  className?: string;
}

export const TripCard = memo(function TripCard({
  trip,
  index = 0,
  className,
}: TripCardProps) {
  const prefetchTrip = usePrefetchTrip(trip.id);

  const dateRange = formatDateRange(trip.startDate, trip.endDate);
  const preset = trip.themeId
    ? (THEME_PRESETS.find((p) => p.id === trip.themeId) ?? null)
    : null;

  // Show up to 3 organizers
  const displayedOrganizers = (trip.organizerInfo ?? []).slice(0, 3);

  const rotation = rotations[index % 4];

  return (
    <TripThemeProvider themeId={trip.themeId} themeFont={trip.themeFont}>
      <Link
        href={`/trips/${trip.id}`}
        {...(supportsHover ? { onMouseEnter: prefetchTrip } : {})}
        onTouchStart={prefetchTrip}
        onFocus={prefetchTrip}
        className={cn(
          "block aspect-[3/2] postcard-card card-noise motion-safe:active:scale-[0.98] cursor-pointer motion-safe:animate-[staggerIn_500ms_ease-out_both]",
          className,
        )}
        style={{
          transform: `rotate(${rotation}deg)`,
          animationDelay: `${index * 80}ms`,
        }}
      >
        {/* Pushpin attachment — top center */}
        <div className="absolute top-[-6px] left-1/2 -translate-x-1/2 z-10 pushpin rotate-[5deg]" />

        {/* Background layer */}
        <div className="absolute inset-0">
          {trip.coverImageUrl ? (
            <Image
              src={getUploadUrl(trip.coverImageUrl)!}
              alt={trip.name}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 50vw"
              className="object-cover"
            />
          ) : preset ? (
            <div
              className="absolute inset-0"
              style={{ background: buildBackground(preset.background) }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-accent/30 to-secondary/40" />
          )}
        </div>

        {/* Gradient scrim at bottom for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Badges overlay — top left */}
        <div className="absolute top-3 left-3 flex gap-2 z-[1]">
          <RsvpBadge status={trip.rsvpStatus} variant="overlay" />
          {trip.isOrganizer && (
            <Badge className="bg-black/50 backdrop-blur-md text-white border-white/20 shadow-sm">
              Organizing
            </Badge>
          )}
        </div>

        {/* Organizer avatars — bottom right */}
        {displayedOrganizers.length > 0 && (
          <div className="absolute bottom-3 right-3 flex -space-x-2 z-[1]">
            {displayedOrganizers.map((org) =>
              org.profilePhotoUrl ? (
                <Image
                  key={org.id}
                  src={getUploadUrl(org.profilePhotoUrl)!}
                  alt={org.displayName}
                  width={24}
                  height={24}
                  className="w-6 h-6 rounded-full ring-2 ring-black/30 object-cover"
                />
              ) : (
                <div
                  key={org.id}
                  className="w-6 h-6 rounded-full ring-2 ring-black/30 bg-white/20 backdrop-blur-sm flex items-center justify-center text-[10px] font-medium text-white"
                >
                  {getInitials(org.displayName)}
                </div>
              ),
            )}
          </div>
        )}

        {/* Overlaid text content — bottom left */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-[1]">
          <h3
            className="text-lg font-semibold text-white mb-1 truncate font-[family-name:var(--font-righteous)] drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
          >
            {trip.name}
          </h3>
          <div className="flex items-center gap-3 text-xs text-white/75 font-[family-name:var(--font-oswald)] uppercase tracking-wide">
            {trip.destination && (
              <span className="truncate">{trip.destination}</span>
            )}
            <span className="shrink-0">{dateRange}</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-white/60">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {trip.memberCount} traveler{trip.memberCount !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              {trip.eventCount === 0
                ? "No events"
                : `${trip.eventCount} event${trip.eventCount === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>
      </Link>
    </TripThemeProvider>
  );
});
