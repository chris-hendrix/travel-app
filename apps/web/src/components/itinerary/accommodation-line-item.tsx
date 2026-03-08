"use client";

import { memo } from "react";
import { Building2, ChevronRight } from "lucide-react";
import type { Accommodation } from "@tripful/shared/types";

interface AccommodationLineItemProps {
  accommodation: Accommodation;
  onClick: (accommodation: Accommodation) => void;
}

export const AccommodationLineItem = memo(function AccommodationLineItem({
  accommodation,
  onClick,
}: AccommodationLineItemProps) {
  const truncatedAddress =
    accommodation.address && accommodation.address.length > 25
      ? accommodation.address.slice(0, 25) + "\u2026"
      : accommodation.address;

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
      <span className="font-semibold text-sm truncate">
        {accommodation.name}
      </span>
      {truncatedAddress && (
        <span className="text-xs text-muted-foreground truncate">
          &middot; {truncatedAddress}
        </span>
      )}
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 ml-auto shrink-0" />
    </div>
  );
});
