"use client";

import { memo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  MapPin,
  Pencil,
  PlaneLanding,
  PlaneTakeoff,
} from "lucide-react";
import type { MemberTravel } from "@tripful/shared/types";
import { Button } from "@/components/ui/button";
import { formatInTimezone } from "@/lib/utils/timezone";

interface MemberTravelCardProps {
  memberTravel: MemberTravel;
  memberName: string;
  timezone: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit?: (memberTravel: MemberTravel) => void;
  onDelete?: (memberTravel: MemberTravel) => void;
  showDate?: boolean;
}

export const MemberTravelCard = memo(function MemberTravelCard({
  memberTravel,
  memberName,
  timezone,
  canEdit,
  onEdit,
  showDate,
}: MemberTravelCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isArrival = memberTravel.travelType === "arrival";
  const PlaneIcon = isArrival ? PlaneLanding : PlaneTakeoff;
  const travelLabel = isArrival ? "Arrival" : "Departure";

  const time = formatInTimezone(memberTravel.time, timezone, "time");
  const dateTime = formatInTimezone(memberTravel.time, timezone, "datetime");
  const date = showDate
    ? formatInTimezone(memberTravel.time, timezone, "date")
    : null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      className="rounded-md border border-border/60 border-l-2 border-l-[var(--color-member-travel)] py-2 px-3 transition-all hover:shadow-md motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98] cursor-pointer"
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
        <div className="shrink-0 text-[var(--color-member-travel)]">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </div>

        <PlaneIcon className="w-3.5 h-3.5 shrink-0 text-[var(--color-member-travel)]" />

        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          <span className="font-semibold text-foreground text-sm truncate">
            {memberName}
          </span>
          {date && (
            <span className="text-xs text-muted-foreground shrink-0">
              {date}
            </span>
          )}
          <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {time}
          </span>
          {memberTravel.location && !isExpanded && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(memberTravel.location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary active:text-primary shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="">
                {memberTravel.location.length > 20
                  ? memberTravel.location.slice(0, 20) + "…"
                  : memberTravel.location}
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
          {/* Location */}
          {memberTravel.location && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(memberTravel.location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground active:text-primary hover:text-primary py-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="">{memberTravel.location}</span>
            </a>
          )}

          {/* Date & Time */}
          <div className="text-sm">
            <span className="text-xs text-muted-foreground">
              {travelLabel} time
            </span>
            <p className="font-medium text-foreground text-xs">{dateTime}</p>
          </div>

          {/* Details (flight number, terminal, etc.) */}
          {memberTravel.details && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {memberTravel.details}
            </p>
          )}

          {/* Edit button */}
          {canEdit && onEdit && (
            <div className="pt-1">
              <Button
                size="xs"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(memberTravel);
                }}
                className="text-xs gap-1"
                title="Edit flight"
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
