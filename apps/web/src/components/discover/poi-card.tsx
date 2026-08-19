"use client";

import { memo } from "react";
import type { POISuggestion, POICategoryKey, TemperatureUnit } from "@journiful/shared/types";
import { cn } from "@/lib/utils";
import { API_URL } from "@/lib/api";

/**
 * Tailwind background colour classes per category, matching the Vivid Capri
 * event tokens. Used for the thin accent strip along the top of the photo well.
 */
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

interface POICardProps {
  poi: POISuggestion;
  onSelect: (poi: POISuggestion) => void;
  temperatureUnit: TemperatureUnit;
}

/**
 * A postcard-styled POI card matching the vintage postcard frames used for trip
 * cards on the trips page (.postcard / .postcard-mat / .postcard-image).
 *
 * The card is a landscape 3:2 photo in a white mat inside a cardboard frame.
 * When a Google Places photo is available (`poi.photoName`) it is loaded via the
 * backend photo proxy as a background-image; otherwise a themed gradient fills
 * the well. A thin category-coloured strip runs along the top of the image well,
 * and the place name (Playfair) + subcategory/distance sit over a bottom scrim.
 */
export const POICard = memo(function POICard({
  poi,
  onSelect,
  temperatureUnit,
}: POICardProps) {
  const accentColor = CATEGORY_ACCENT_COLORS[poi.category];

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
        "postcard w-full text-left cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "motion-safe:active:scale-[0.98]",
      )}
    >
      {/* Mat: white border around the photo */}
      <div className="postcard-mat bg-card" style={{ padding: 8 }}>
        <div className="postcard-image">
          {/* Photo background (only when photoName present) */}
          {poi.photoName ? (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${API_URL}/locations/photos/${encodeURIComponent(poi.photoName)}?maxWidthPx=400&maxHeightPx=280)`,
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/15 to-secondary/20" />
          )}

          {/* Category accent strip */}
          <div className={cn("absolute top-0 left-0 right-0 h-0.5 z-10", accentColor)} />

          {/* Scrim — always renders so text stays readable with or without photo */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          {/* Top-left: business-status badge (non-OPERATIONAL only) */}
          {showBusinessStatus && (
            <span className="absolute top-2 left-2 z-10 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white border border-white/20 backdrop-blur-md">
              {poi.businessStatus}
            </span>
          )}

          {/* Top-right: photo attribution (Google ToS requires credit per display) */}
          {poi.photoAttribution && (
            <span className="absolute top-2 right-2 z-10 text-[9px] text-white/60 drop-shadow">
              {poi.photoAttribution}
            </span>
          )}

          {/* Bottom: name + subcategory · distance */}
          <div className="absolute bottom-0 left-0 right-0 p-2">
            <h3 className="font-playfair text-sm font-semibold leading-snug text-white drop-shadow-md line-clamp-2">
              {poi.name}
            </h3>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-white/80">
              {poi.subcategory && <span className="truncate">{poi.subcategory}</span>}
              {poi.subcategory && <span className="shrink-0 text-white/50">·</span>}
              <span className="shrink-0">{formatDistance(poi.distance, temperatureUnit)}</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
});
