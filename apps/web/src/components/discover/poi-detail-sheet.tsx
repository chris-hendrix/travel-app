"use client";

import { useMemo, useEffect } from "react";
import { VisuallyHidden } from "radix-ui";
import { MapPin, Navigation, ExternalLink, Phone, XIcon, ChevronLeft, ChevronRight } from "lucide-react";
import type { POISuggestion, POICategoryKey, TemperatureUnit } from "@journiful/shared/types";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { API_URL } from "@/lib/api";

interface POIDetailSheetProps {
  poi: POISuggestion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateEvent: (poi: POISuggestion) => void;
  temperatureUnit: TemperatureUnit;
  // Navigation props for prev/next browsing
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  poiIndex: number;
  totalPois: number;
}

const CATEGORY_ACCENT_COLORS: Record<POICategoryKey, string> = {
  food_and_drink: "bg-event-food_and_drink",
  arts_and_entertainment: "bg-event-arts_and_entertainment",
  outdoors: "bg-event-outdoors",
  nightlife: "bg-event-nightlife",
  wellness: "bg-event-wellness",
  shopping: "bg-event-shopping",
  lodging: "bg-event-lodging",
};

/**
 * Format distance in metres to a short human-readable string.
 *
 * - Imperial (fahrenheit): feet < 1000 → "N ft", else "N.N mi"
 * - Metric (celsius): meters < 1000 → "N m", else "N.N km"
 */
function formatDistance(meters: number, unit: TemperatureUnit): string {
  if (unit === "fahrenheit") {
    const feet = meters * 3.28084;
    if (feet < 1000) return `${Math.round(feet)} ft`;
    return `${(meters / 1609.34).toFixed(1)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function POIDetailSheet({
  poi,
  open,
  onOpenChange,
  onCreateEvent,
  temperatureUnit,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  poiIndex,
  totalPois,
}: POIDetailSheetProps) {
  const accentColor = poi ? CATEGORY_ACCENT_COLORS[poi.category] : null;

  // Keyboard arrow navigation between POIs while the sheet is open.
  // Skipped when focus is in a form field (don't hijack text editing).
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && hasPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, hasPrev, hasNext, onPrev, onNext]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent showCloseButton={false}>
        <VisuallyHidden.Root>
          <SheetTitle>POI details</SheetTitle>
        </VisuallyHidden.Root>

        {/* Accent bar */}
        {accentColor && (
          <div className={cn("h-1.5 w-full", accentColor)} />
        )}

        {/* Header: counter (left) + close (right) */}
        <div className="flex items-center justify-between gap-1 px-4 pt-4">
          {poi && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {poiIndex + 1} of {totalPois}
            </span>
          )}
          <SheetClose className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
            <XIcon className="w-4 h-4" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>

        <SheetBody>
          {poi && (
            <POIDetailBody
              poi={poi}
              onCreateEvent={onCreateEvent}
              temperatureUnit={temperatureUnit}
              onPrev={onPrev}
              onNext={onNext}
              hasPrev={hasPrev}
              hasNext={hasNext}
            />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function POIDetailBody({
  poi,
  onCreateEvent,
  temperatureUnit,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  poi: POISuggestion;
  onCreateEvent: (poi: POISuggestion) => void;
  temperatureUnit: TemperatureUnit;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  // Extract hostname from URL for clean display
  const websiteHostname = useMemo(() => {
    if (!poi.website) return null;
    try {
      return new URL(poi.website).hostname;
    } catch {
      return poi.website;
    }
  }, [poi.website]);

  const mapsHref =
    poi.googleMapsUri ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(poi.address ?? poi.name)}`;

  return (
    <div className="flex flex-col h-full">
      <div className="space-y-4 flex-1">
        {/* Cover photo hero with chevron navigation */}
        <div className="relative">
          {poi.photoName ? (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="relative block w-full aspect-[3/2] bg-cover bg-center"
              style={{
                backgroundImage: `url(${API_URL}/locations/photos/${encodeURIComponent(poi.photoName)}?maxWidthPx=600&maxHeightPx=400)`,
              }}
              aria-label={`Open ${poi.name} in Google Maps`}
            >
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              {/* "Open in Google Maps" overlay */}
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/60 text-white text-xs px-2 py-1" aria-hidden="true">
                <MapPin className="w-3 h-3" />
                Google Maps
              </span>
            </a>
          ) : (
            <div className="w-full aspect-[3/2] bg-muted flex items-center justify-center">
              <MapPin className="w-8 h-8 text-muted-foreground/50" />
            </div>
          )}

          {/* Prev/Next chevrons as siblings */}
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="absolute z-20 rounded-full bg-black/50 text-white p-1 hover:bg-black/70 disabled:opacity-30 left-2 top-1/2 -translate-y-1/2"
            aria-label="Previous place"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="absolute z-20 rounded-full bg-black/50 text-white p-1 hover:bg-black/70 disabled:opacity-30 right-2 top-1/2 -translate-y-1/2"
            aria-label="Next place"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* POI name */}
        <h3 className="font-playfair text-xl font-semibold line-clamp-2 min-w-0">
          {poi.name}
        </h3>

        {/* Subcategory · distance */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground/70 min-w-0">
          {poi.subcategory && <span className="truncate">{poi.subcategory}</span>}
          {poi.subcategory && <span className="shrink-0 text-muted-foreground/40">·</span>}
          <span className="shrink-0 flex items-center gap-1">
            <Navigation className="w-3.5 h-3.5 shrink-0" />
            {formatDistance(poi.distance, temperatureUnit)}
          </span>
        </div>

        {/* Address (link to Google Maps), website, phone */}
        <div className="space-y-2 text-sm text-muted-foreground">
          {poi.address && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-primary transition-colors min-w-0"
            >
              <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="truncate min-w-0">{poi.address}</span>
              <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground/60" />
            </a>
          )}

          {(websiteHostname || poi.tel) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {websiteHostname && (
                <a
                  href={poi.website!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-primary transition-colors min-w-0"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate min-w-0">{websiteHostname}</span>
                </a>
              )}
              {poi.tel && (
                <a
                  href={`tel:${poi.tel}`}
                  className="flex items-center gap-1.5 hover:text-primary transition-colors"
                >
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{poi.tel}</span>
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom section: Create Event + attribution */}
      <div className="pt-4 space-y-2">
        <Button
          variant="gradient"
          className="w-full h-12 rounded-md"
          onClick={() => onCreateEvent(poi)}
        >
          Create Event
        </Button>
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          {poi.photoAttribution && (
            <span>Photo by {poi.photoAttribution}</span>
          )}
          {poi.photoAttribution && <span className="text-muted-foreground/40">·</span>}
          <span>Powered by Google</span>
        </div>
      </div>
    </div>
  );
}
