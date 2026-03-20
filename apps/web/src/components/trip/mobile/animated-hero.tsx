"use client";

import Image from "next/image";
import { MapPin, Calendar, Paintbrush } from "lucide-react";
import { THEME_PRESETS, THEME_FONTS } from "@journiful/shared/config";
import { TopoPattern } from "@/components/ui/topo-pattern";
import { formatDateRange } from "@/lib/format";
import { getUploadUrl } from "@/lib/api";
import type { TripDetailWithMeta } from "@/hooks/trip-queries";

const HERO_FULL = 200;
const HERO_COMPACT = 80;

interface AnimatedHeroProps {
  trip: TripDetailWithMeta;
  collapseProgress: number;
  isOrganizer: boolean;
  onCustomize: () => void;
}

export function AnimatedHero({
  trip,
  collapseProgress,
  isOrganizer,
  onCustomize,
}: AnimatedHeroProps) {
  const preset = trip.themeId
    ? (THEME_PRESETS.find((p) => p.id === trip.themeId) ?? null)
    : null;

  const heroTextLight =
    trip.coverImageUrl ||
    preset?.defaultCoverUrl ||
    !preset ||
    preset.background.isDark;

  const dateRange = formatDateRange(trip.startDate, trip.endDate);
  const heroHeight = HERO_FULL - (HERO_FULL - HERO_COMPACT) * collapseProgress;

  // The inner content stays full height and slides up as the container shrinks,
  // revealing only the bottom portion (title/metadata area) when collapsed.
  const translateY = -(HERO_FULL - heroHeight);

  return (
    <div
      className="relative w-full overflow-hidden shrink-0 transition-[height] duration-300 ease-out"
      style={{ height: `${heroHeight}px` }}
    >
      {/* Full-height inner that slides upward as container shrinks */}
      <div
        className="relative w-full transition-transform duration-300 ease-out"
        style={{
          height: `${HERO_FULL}px`,
          transform: `translateY(${translateY}px)`,
        }}
      >
        {/* Background: cover photo -> theme cover -> theme gradient -> default */}
        {trip.coverImageUrl ? (
          <Image
            src={getUploadUrl(trip.coverImageUrl)!}
            alt={trip.name}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : preset?.defaultCoverUrl ? (
          <Image
            src={preset.defaultCoverUrl}
            alt={preset.name}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : preset ? (
          <div
            className="absolute inset-0"
            style={{ background: "var(--theme-background)" }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-accent/20 to-secondary/30">
            <TopoPattern className="opacity-[0.12] text-white" />
          </div>
        )}

        {/* Gradient scrim */}
        {(trip.coverImageUrl || preset?.defaultCoverUrl) && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        )}

        {/* Title + metadata — pinned to bottom */}
        <div className="absolute bottom-0 left-0 right-0 pb-3">
          <div className="px-4 flex items-end">
            <div className="flex-1 min-w-0">
              <h1
                className={`text-2xl font-bold ${heroTextLight ? "text-white" : "text-foreground"} font-playfair line-clamp-2 drop-shadow-sm`}
                style={
                  trip.themeFont
                    ? {
                        fontFamily:
                          THEME_FONTS[
                            trip.themeFont as keyof typeof THEME_FONTS
                          ],
                      }
                    : undefined
                }
              >
                {trip.name}
              </h1>
              <div
                className={`flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-sm ${heroTextLight ? "text-white/80 [text-shadow:0_1px_2px_rgb(0_0_0/0.4)]" : "text-foreground/80"}`}
              >
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <MapPin
                    className="w-4 h-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="truncate">{trip.destination}</span>
                </span>
                <span aria-hidden="true">&middot;</span>
                <span className="inline-flex items-center gap-1.5 shrink-0">
                  <Calendar
                    className="w-4 h-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{dateRange}</span>
                </span>
              </div>
            </div>

            {/* Customize button — fades out as hero collapses */}
            {isOrganizer && (
              <button
                onClick={onCustomize}
                className={`shrink-0 ml-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium backdrop-blur-sm transition-all duration-300 cursor-pointer ${
                  heroTextLight
                    ? "bg-white/20 text-white hover:bg-white/30"
                    : "bg-black/10 text-foreground hover:bg-black/20"
                }`}
                style={{ opacity: 1 - collapseProgress }}
                aria-label="Customize theme"
              >
                <Paintbrush className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
