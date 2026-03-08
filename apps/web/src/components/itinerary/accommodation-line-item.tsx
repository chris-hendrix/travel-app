"use client";

import { memo } from "react";
import { Building2, ChevronRight, ExternalLink } from "lucide-react";
import type { Accommodation } from "@tripful/shared/types";

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
      className="flex items-center gap-2 py-2.5 px-3 border-b border-border/40 hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={() => onClick(accommodation)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(accommodation);
        }
      }}
    >
      <Building2 className="w-3.5 h-3.5 text-accommodation shrink-0" />
      <span className="font-semibold text-sm truncate min-w-0">
        {accommodation.name}
      </span>
      {accommodation.address && (
        <>
          <span className="text-xs text-muted-foreground truncate min-w-0 hidden sm:inline">
            {accommodation.address}
          </span>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(accommodation.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors shrink-0"
            onClick={(e) => e.stopPropagation()}
            aria-label={`${accommodation.name} on Google Maps`}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </>
      )}
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 ml-auto shrink-0" />
    </div>
  );
});
