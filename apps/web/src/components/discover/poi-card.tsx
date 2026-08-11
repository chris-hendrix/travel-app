"use client";

import { memo } from "react";
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
  wellness: "border-l-event-wellness",
  shopping: "border-l-event-shopping",
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

const apiBase: string =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : "";

interface POICardProps {
  poi: POISuggestion;
  onSelect: (poi: POISuggestion) => void;
  temperatureUnit: TemperatureUnit;
}

/**
 * A background-image POI card with a gradient overlay.
 *
 * When a Google Places photo is available (`poi.photoName`), it is loaded via the
 * backend photo proxy and rendered as a `background-image` on a full-bleed div behind
 * a gradient overlay. Without a photo the card falls back to `bg-card`.
 *
 * A colour-coded left accent bar, the place name, optional subcategory chip, distance
 * chip, business-status badge (non-OPERATIONAL only), and photo attribution are
 * layered on top.
 */
export const POICard = memo(function POICard({
  poi,
  onSelect,
  temperatureUnit,
}: POICardProps) {
  const borderColor = CATEGORY_BORDER_COLORS[poi.category];

  const ariaLabel = poi.photoAttribution
    ? `${poi.name} \u2014 Photo by ${poi.photoAttribution}`
    : poi.name;

  const showBusinessStatus =
    poi.businessStatus !== null && poi.businessStatus !== "OPERATIONAL";

  return (
    <button
      type="button"
      onClick={() => onSelect(poi)}
      aria-label={ariaLabel}
      className={cn(
        "relative w-full aspect-square overflow-hidden rounded-lg bg-card border border-border text-left cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "motion-safe:active:scale-[0.98]",
      )}
    >
      {/* Photo background (only when photoName present) */}
      {poi.photoName && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${apiBase}/locations/photos/${encodeURIComponent(poi.photoName)}?maxWidthPx=400&maxHeightPx=280)`,
          }}
        />
      )}

      {/* Gradient overlay — always renders so text stays readable with or without photo */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Left accent border strip */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1 border-l-4", borderColor)} />

      {/* Foreground content */}
      <div className="relative z-10 p-3 flex flex-col h-full justify-between">
        {/* Top: name + businessStatus badge */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm text-white drop-shadow-md line-clamp-2">
            {poi.name}
          </h3>
          {showBusinessStatus && (
            <span className="shrink-0 text-xs bg-destructive/20 text-destructive rounded px-1.5 py-0.5 whitespace-nowrap">
              {poi.businessStatus}
            </span>
          )}
        </div>

        {/* Bottom: chips + attribution */}
        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {poi.subcategory && (
              <span className="text-xs bg-black/40 text-white/90 rounded px-1.5 py-0.5">
                {poi.subcategory}
              </span>
            )}
            <span className="text-xs bg-black/40 text-white/90 rounded px-1.5 py-0.5">
              {formatDistance(poi.distance, temperatureUnit)}
            </span>
          </div>
          {poi.photoAttribution && (
            <span className="shrink-0 text-[10px] text-white/70">
              Photo: {poi.photoAttribution}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});
