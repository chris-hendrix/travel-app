"use client";

import { memo } from "react";
import { MapPin, Navigation } from "lucide-react";
import type { POISuggestion, POICategoryKey } from "@journiful/shared/types";
import { cn } from "@/lib/utils";

/** Human-readable labels for each POI category */
const CATEGORY_LABELS: Record<POICategoryKey, string> = {
  food_and_drink: "Food & Drink",
  arts_and_entertainment: "Arts",
  outdoors: "Outdoors",
  nightlife: "Nightlife",
};

/**
 * Tailwind colour classes per category, matching the Vivid Capri event tokens.
 *
 * Each key uses the `event-{category}` tokens defined in globals.css so badges
 * are colour-coded consistently with how events of the same type appear in
 * the itinerary.
 */
const CATEGORY_COLORS: Record<
  POICategoryKey,
  { badge: string; text: string }
> = {
  food_and_drink: {
    badge: "bg-event-food_and_drink-light text-event-food_and_drink",
    text: "text-event-food_and_drink",
  },
  arts_and_entertainment: {
    badge: "bg-event-arts_and_entertainment-light text-event-arts_and_entertainment",
    text: "text-event-arts_and_entertainment",
  },
  outdoors: {
    badge: "bg-event-outdoors-light text-event-outdoors",
    text: "text-event-outdoors",
  },
  nightlife: {
    badge: "bg-event-nightlife-light text-event-nightlife",
    text: "text-event-nightlife",
  },
};

/**
 * Format distance in metres to a short human-readable string.
 *
 * - < 1000 m → "N m"
 * - ≥ 1000 m → "N.N km"
 */
function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

interface POICardProps {
  poi: POISuggestion;
  onSelect: (poi: POISuggestion) => void;
}

/**
 * A compact card that displays a single POI suggestion.
 *
 * Renders a colour-coded category badge, the place name, truncated address,
 * and distance from the trip destination. Clicking the card invokes
 * `onSelect` with the full POI object so the parent can open the event
 * creation dialog.
 */
export const POICard = memo(function POICard({
  poi,
  onSelect,
}: POICardProps) {
  const colors = CATEGORY_COLORS[poi.category];

  return (
    <button
      type="button"
      onClick={() => onSelect(poi)}
      className={cn(
        "group flex flex-col gap-1.5 rounded-md border border-border p-3",
        "bg-card text-left transition-all",
        "hover:border-primary/40 hover:shadow-sm hover:bg-accent/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "cursor-pointer w-56 shrink-0",
        "motion-safe:active:scale-[0.98]",
      )}
    >
      {/* Category badge */}
      <span
        className={cn(
          "inline-flex items-center rounded-sm px-1.5 py-0.5",
          "text-[10px] font-semibold uppercase tracking-wider font-accent",
          colors.badge,
        )}
      >
        {CATEGORY_LABELS[poi.category]}
      </span>

      {/* Name */}
      <span className="text-sm font-semibold text-foreground leading-tight line-clamp-2">
        {poi.name}
      </span>

      {/* Address — truncate to 1 line */}
      {poi.address && (
        <span className="flex items-start gap-1 text-xs text-muted-foreground truncate">
          <MapPin className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
          <span className="truncate">{poi.address}</span>
        </span>
      )}

      {/* Distance — always visible when available */}
      <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
        <Navigation className="w-3 h-3" aria-hidden="true" />
        {formatDistance(poi.distance)}
      </span>
    </button>
  );
});
