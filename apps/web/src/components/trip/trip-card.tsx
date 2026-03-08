"use client";

import { memo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Calendar, MapPin, ImagePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RsvpBadge } from "@/components/ui/rsvp-badge";
import { formatDateRange } from "@/lib/format";
import { getUploadUrl } from "@/lib/api";
import { TripThemeProvider } from "@/components/trip/trip-theme-provider";
import { buildBackground } from "@/lib/theme-styles";
import { THEME_PRESETS } from "@tripful/shared/config";
import { THEME_FONTS } from "@tripful/shared/config";
import { usePrefetchTrip } from "@/hooks/use-trips";
import { supportsHover } from "@/lib/supports-hover";
import { cn } from "@/lib/utils";

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
  // Mat background: theme cards use theme background, others use bg-card
  const matBackground = preset
    ? buildBackground(preset.background)
    : undefined;

  const fontFamily = trip.themeFont
    ? THEME_FONTS[trip.themeFont as keyof typeof THEME_FONTS]
    : undefined;

  return (
    <TripThemeProvider themeId={trip.themeId} themeFont={trip.themeFont}>
      <Link
        href={`/trips/${trip.id}`}
        {...(supportsHover ? { onMouseEnter: prefetchTrip } : {})}
        onTouchStart={prefetchTrip}
        onFocus={prefetchTrip}
        className={cn(
          "postcard motion-safe:animate-[staggerIn_500ms_ease-out_both]",
          className,
        )}
        style={{ animationDelay: `${index * 80}ms` }}
      >
        {/* Mat: white border */}
        <div
          className={cn("postcard-mat", !matBackground && "bg-card")}
          style={matBackground ? { background: matBackground } : undefined}
        >
          {/* Inner: cover image with overlay */}
          <div className="postcard-image">
              {trip.coverImageUrl ? (
                <Image
                  src={getUploadUrl(trip.coverImageUrl)!}
                  alt={trip.name}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  className="object-cover"
                />
              ) : preset?.defaultCoverUrl ? (
                <Image
                  src={preset.defaultCoverUrl}
                  alt={preset.name}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  className="object-cover"
                />
              ) : preset ? (
                <div
                  className="absolute inset-0"
                  style={{ background: buildBackground(preset.background) }}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/15 to-secondary/20 flex items-center justify-center">
                  <ImagePlus className="w-8 h-8 text-foreground/20" />
                </div>
              )}

              {/* Scrim gradient for text readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

              {/* Badges overlay — top-left */}
              <div className="absolute top-3 left-3 flex gap-2">
                {trip.isOrganizer && (
                  <Badge className="bg-black/50 backdrop-blur-md text-white border-white/20 shadow-sm">
                    Organizing
                  </Badge>
                )}
                <RsvpBadge status={trip.rsvpStatus} variant="overlay" />
              </div>

              {/* Trip info overlay — bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h3
                  className="text-lg font-semibold text-white mb-1 truncate font-playfair"
                  style={fontFamily ? { fontFamily } : undefined}
                >
                  {trip.name}
                </h3>
                <div className="flex items-center gap-3 text-white/80 text-sm">
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    {trip.destination}
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    {dateRange}
                  </span>
                </div>
              </div>
            </div>

          </div>
      </Link>
    </TripThemeProvider>
  );
});
