"use client";

import { memo } from "react";
import { MapPin, Navigation } from "lucide-react";
import type { POISuggestion, POICategoryKey, TemperatureUnit } from "@journiful/shared/types";
import { cn } from "@/lib/utils";

/**
 * Tailwind border colour classes per category, matching the Vivid Capri event tokens.
 *
 * Each key uses the `border-l-event-{category}` tokens defined in globals.css so the
 * left accent bar is colour-coded consistently with events of the same type in the
 * itinerary.
 */
const CATEGORY_BORDER_COLORS: Record<POICategoryKey, string> = {
  food_and_drink: "border-l-event-food_and_drink",
  arts_and_entertainment: "border-l-event-arts_and_entertainment",
  outdoors: "border-l-event-outdoors",
  nightlife: "border-l-event-nightlife",
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

interface POICardProps {
  poi: POISuggestion;
  onSelect: (poi: POISuggestion) => void;
  temperatureUnit: TemperatureUnit;
}

/**
 * A compact card that displays a single POI suggestion.
 *
 * Renders a colour-coded left accent bar, the place name (1-line truncated),
 * optional subcategory, truncated address, and distance from the trip
 * destination. Clicking the card invokes `onSelect` with the full POI
 * object so the parent can open the detail sheet or event creation dialog.
 */
export const POICard = memo(function POICard({
  poi,
  onSelect,
  temperatureUnit,
}: POICardProps) {
  const borderColor = CATEGORY_BORDER_COLORS[poi.category];

  return (
    <button
      type="button"
      onClick={() => onSelect(poi)}
      className={cn(
        "group flex flex-col gap-1 rounded-md p-2.5",
        "bg-card text-left transition-all overflow-hidden",
        "hover:border-primary/40 hover:shadow-sm hover:bg-accent/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "cursor-pointer motion-safe:active:scale-[0.98]",
        "w-[200px] shrink-0 border-l-2",
        borderColor,
      )}
    >
      {/* Name — 1-line truncated */}
      <span className="text-sm font-semibold text-foreground leading-tight truncate min-w-0">
        {poi.name}
      </span>

      {/* Subcategory */}
      {poi.subcategory && (
        <span className="text-xs text-muted-foreground truncate min-w-0">
          {poi.subcategory}
        </span>
      )}

      {/* Address — always rendered to maintain layout height */}
      <span className="flex items-start gap-1 text-xs text-muted-foreground min-w-0">
        <MapPin className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
        <span className="truncate min-w-0">{poi.address || "\u2014"}</span>
      </span>

      {/* Distance */}
      <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
        <Navigation className="w-3 h-3" aria-hidden="true" />
        {formatDistance(poi.distance, temperatureUnit)}
      </span>
    </button>
  );
});
