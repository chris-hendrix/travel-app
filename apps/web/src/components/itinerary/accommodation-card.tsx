"use client";

import { memo, useState } from "react";
import {
  Building2,
  MapPin,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Pencil,
} from "lucide-react";
import type { Accommodation } from "@tripful/shared/types";
import { Button } from "@/components/ui/button";
import { formatInTimezone } from "@/lib/utils/timezone";

interface AccommodationCardProps {
  accommodation: Accommodation;
  timezone: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit?: (accommodation: Accommodation) => void;
  onDelete?: (accommodation: Accommodation) => void;
  createdByName?: string | undefined;
  showDate?: boolean;
}

export const AccommodationCard = memo(function AccommodationCard({
  accommodation,
  timezone,
  canEdit,
  onEdit,
  createdByName,
  showDate,
}: AccommodationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const datePrefix = showDate
    ? formatInTimezone(accommodation.checkIn, timezone, "date")
    : null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      className="rounded-md border border-border/60 border-l-2 border-l-[var(--color-accommodation)] py-2 px-3 transition-all hover:shadow-md motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98] cursor-pointer"
      onClick={() => setIsExpanded((prev) => !prev)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsExpanded((prev) => !prev);
        }
      }}
    >
      {/* Compact view */}
      <div className="flex items-center gap-2">
        <div className="shrink-0 text-[var(--color-accommodation)]">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </div>

        <Building2 className="w-3.5 h-3.5 shrink-0 text-[var(--color-accommodation)]" />

        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          <span className="font-semibold text-foreground text-sm truncate">
            {accommodation.name}
          </span>
          {datePrefix && (
            <span className="text-xs text-muted-foreground shrink-0">
              {datePrefix}
            </span>
          )}
          {accommodation.address && !isExpanded && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(accommodation.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary active:text-primary shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="">
                {accommodation.address.length > 20
                  ? accommodation.address.slice(0, 20) + "…"
                  : accommodation.address}
              </span>
            </a>
          )}
        </div>
      </div>

      {/* Expanded view */}
      {isExpanded && (
        <div
          className="mt-2 pt-2 border-t border-border/40 space-y-2 ml-6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Address */}
          {accommodation.address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(accommodation.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground active:text-primary hover:text-primary py-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="">{accommodation.address}</span>
            </a>
          )}

          {/* Check-in / Check-out */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Check-in</span>
              <p className="font-medium text-foreground text-xs">
                {formatInTimezone(accommodation.checkIn, timezone, "datetime")}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Check-out</span>
              <p className="font-medium text-foreground text-xs">
                {formatInTimezone(accommodation.checkOut, timezone, "datetime")}
              </p>
            </div>
          </div>

          {/* Description */}
          {accommodation.description && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {accommodation.description}
            </p>
          )}

          {/* Links */}
          {accommodation.links && accommodation.links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {accommodation.links.map((link, index) => (
                <a
                  key={index}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3" />
                  Link {index + 1}
                </a>
              ))}
            </div>
          )}

          {/* Created by */}
          <div className="text-xs text-muted-foreground">
            Created by {createdByName || "Unknown"}
          </div>

          {/* Edit button */}
          {canEdit && onEdit && (
            <div className="pt-1">
              <Button
                size="xs"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(accommodation);
                }}
                className="text-xs gap-1"
                title="Edit accommodation"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
