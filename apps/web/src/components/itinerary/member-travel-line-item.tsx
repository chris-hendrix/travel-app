"use client";

import React, { memo, useCallback } from "react";
import {
  ChevronRight,
  ExternalLink,
  PlaneLanding,
  PlaneTakeoff,
} from "lucide-react";
import type { MemberTravel } from "@tripful/shared/types";
import { formatInTimezone } from "@/lib/utils/timezone";

interface MemberTravelLineItemProps {
  memberTravel: MemberTravel;
  memberName: string;
  timezone: string;
  onClick: (memberTravel: MemberTravel) => void;
}

export const MemberTravelLineItem = memo(function MemberTravelLineItem({
  memberTravel,
  memberName,
  timezone,
  onClick,
}: MemberTravelLineItemProps) {
  const PlaneIcon =
    memberTravel.travelType === "arrival" ? PlaneLanding : PlaneTakeoff;

  const time = formatInTimezone(memberTravel.time, timezone, "time");

  const handleClick = useCallback(() => {
    onClick(memberTravel);
  }, [onClick, memberTravel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick(memberTravel);
      }
    },
    [onClick, memberTravel],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="flex items-center gap-2 py-2 px-3 border-b border-border/40 hover:bg-muted/50 cursor-pointer transition-colors"
    >
      <PlaneIcon className="w-3 h-3 text-member-travel shrink-0" />
      <span className="font-medium text-xs truncate">{memberName}</span>
      <span className="text-[11px] text-muted-foreground">· {time}</span>
      {memberTravel.location && (
        <>
          <span className="text-[11px] text-muted-foreground truncate min-w-0">
            {memberTravel.location}
          </span>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(memberTravel.location)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors shrink-0"
            onClick={(e) => e.stopPropagation()}
            aria-label={`${memberTravel.location} on Google Maps`}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </>
      )}
      <ChevronRight className="w-3 h-3 text-muted-foreground/60 ml-auto shrink-0" />
    </div>
  );
});
