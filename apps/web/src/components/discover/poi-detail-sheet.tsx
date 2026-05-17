"use client";

import { useMemo } from "react";
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
};

const CATEGORY_LABELS: Record<POICategoryKey, string> = {
  food_and_drink: "Food & Drink",
  arts_and_entertainment: "Arts & Entertainment",
  outdoors: "Outdoors",
  nightlife: "Nightlife",
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

        {/* Header actions */}
        <div className="flex items-center justify-end gap-1 px-4 pt-4">
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
              poiIndex={poiIndex}
              totalPois={totalPois}
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
  poiIndex,
  totalPois,
}: {
  poi: POISuggestion;
  onCreateEvent: (poi: POISuggestion) => void;
  temperatureUnit: TemperatureUnit;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  poiIndex: number;
  totalPois: number;
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

  return (
    <div className="flex flex-col h-full">
      <div className="space-y-4 flex-1">
        {/* Category label */}
        <p className="text-sm text-muted-foreground">
          {CATEGORY_LABELS[poi.category]}
        </p>

        {/* POI name with navigation arrows (weather pattern) */}
        <div className="flex items-center justify-between">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
            aria-label="Previous place"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3 className="font-playfair text-xl font-semibold text-center px-2 truncate min-w-0">
            {poi.name}
          </h3>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
            aria-label="Next place"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Position counter */}
        <p className="text-xs text-muted-foreground text-center">
          {poiIndex + 1} of {totalPois}
        </p>

        {/* Non-clickable info: subcategory + distance */}
        <div className="space-y-1.5">
          {poi.subcategory && (
            <p className="text-sm text-muted-foreground">
              {poi.subcategory}
            </p>
          )}
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground/70">
            <Navigation className="w-3.5 h-3.5 shrink-0" />
            {formatDistance(poi.distance, temperatureUnit)}
          </span>
        </div>

        {/* Clickable links: address, website, phone */}
        <div className="space-y-2">
          {poi.address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(poi.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors min-w-0"
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate min-w-0">{poi.address}</span>
              <span className="text-xs opacity-60 shrink-0">Google Maps</span>
            </a>
          )}

          {websiteHostname && (
            <a
              href={poi.website!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors min-w-0"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate min-w-0">{websiteHostname}</span>
            </a>
          )}

          {poi.tel && (
            <a
              href={`tel:${poi.tel}`}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{poi.tel}</span>
            </a>
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
        <p className="text-xs text-muted-foreground text-center">
          Added by Foursquare Places
        </p>
      </div>
    </div>
  );
}
