"use client";

import { VisuallyHidden } from "radix-ui";
import { MapPin, Navigation, ExternalLink, Phone, XIcon } from "lucide-react";
import type { POISuggestion, POICategoryKey } from "@journiful/shared/types";
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

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function POIDetailSheet({
  poi,
  open,
  onOpenChange,
  onCreateEvent,
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
}: {
  poi: POISuggestion;
  onCreateEvent: (poi: POISuggestion) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Category label */}
      <p className="text-sm text-muted-foreground">
        {CATEGORY_LABELS[poi.category]}
      </p>

      {/* Subcategory (optional) */}
      {poi.subcategory && (
        <p className="text-sm text-muted-foreground">
          {poi.subcategory}
        </p>
      )}

      {/* POI name */}
      <h3 className="font-playfair text-xl font-semibold">
        {poi.name}
      </h3>

      {/* Location details */}
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

        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Navigation className="w-3.5 h-3.5 shrink-0" />
          {formatDistance(poi.distance)}
        </span>

        {poi.website && (
          <a
            href={poi.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors min-w-0"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate min-w-0">{poi.website}</span>
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

      {/* Create Event button */}
      <Button
        variant="gradient"
        size="lg"
        className="w-full rounded-md"
        onClick={() => onCreateEvent(poi)}
      >
        Create Event
      </Button>

      {/* Source attribution */}
      <p className="text-xs text-muted-foreground text-center">
        Added by Foursquare Places
      </p>
    </div>
  );
}
