"use client";

import { memo } from "react";
import { Building2, MapPin } from "lucide-react";
import type { Accommodation } from "@journiful/shared/types";

interface AccommodationLineItemProps {
  accommodation: Accommodation;
  onClick: (accommodation: Accommodation) => void;
}

export const AccommodationLineItem = memo(function AccommodationLineItem({
  accommodation,
  onClick,
}: AccommodationLineItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="flex items-center gap-2 py-2 px-3 rounded-md border border-border/60 border-l-4 border-l-accommodation bg-accommodation-light transition-all hover:shadow-lg motion-safe:hover:-translate-y-1 motion-safe:active:scale-[0.98] cursor-pointer"
      onClick={() => onClick(accommodation)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(accommodation);
        }
      }}
    >
      <Building2 className="w-3 h-3 text-accommodation shrink-0" />
      <span className="font-medium text-xs truncate min-w-0">
        {accommodation.name}
      </span>
      {accommodation.address && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(accommodation.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors min-w-0"
          onClick={(e) => e.stopPropagation()}
          aria-label={`${accommodation.name} on Google Maps`}
        >
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{accommodation.address}</span>
        </a>
      )}
    </div>
  );
});
